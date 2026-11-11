/* Bulk-add modal, opened from the "Bulk Add" button next to the folder dropdown. */
import { auth } from '../lib/firebase.mjs';
import { getCachedFolders, getCachedWatchList, setCachedWatchList } from '../lib/storage.mjs';
import { saveWatchlistItems, saveWatchlistItemFolders, createFolder } from '../lib/watchlist-repo.mjs';
import { looksLikeJson, parseImportFile } from '../lib/watchlist-import.mjs';
import { getStockData, fetchStockInfo, runStockCalculations } from '../lib/stock-service.mjs';
import { mapWithConcurrencyLimit } from '../lib/watchlist-logic.mjs';
import { parseBulkTickers } from '../lib/ticker.mjs';
import { notifyWatchlistChanged } from '../lib/events.mjs';
import { watchlistState } from './watchlist-state.mjs';
import { renderFolderDropdown } from './folders.mjs';

const bulkAddBtn               = document.getElementById("bulkAddBtn");
const bulkAddModalOverlay      = document.getElementById("bulkAddModalOverlay");
const bulkAddModalForm         = document.getElementById("bulkAddModalForm");
const bulkAddModalInput        = document.getElementById("bulkAddModalInput");
const bulkAddModalStatus       = document.getElementById("bulkAddModalStatus");
const bulkAddModalCloseBtn     = document.getElementById("bulkAddModalCloseBtn");
const bulkAddModalCancelBtn    = document.getElementById("bulkAddModalCancelBtn");
const bulkAddModalSubmitBtn    = document.getElementById("bulkAddModalSubmitBtn");
const bulkAddFolders           = document.getElementById("bulkAddModalFolders");
const bulkAddFileBtn           = document.getElementById("bulkAddModalFileBtn");
const bulkAddFileInput         = document.getElementById("bulkAddModalFileInput");
const BULK_ADD_MAX_TICKERS     = 200;
const BULK_ADD_MAX_IMPORT_TICKERS = 500; // one Firestore batch
let bulkAddRunning             = false;
let bulkAddFolderIds           = new Set();
let bulkAddPendingImport       = null; // parsed export file chosen with the file button

if (bulkAddModalOverlay) {
    if (bulkAddFileBtn && bulkAddFileInput) {
        bulkAddFileBtn.addEventListener('click', () => bulkAddFileInput.click());
        bulkAddFileInput.addEventListener('change', onImportFileChosen);
    }
    bulkAddBtn.addEventListener('click', openBulkAddModal);
    bulkAddModalCloseBtn.addEventListener('click', closeBulkAddModal);
    bulkAddModalCancelBtn.addEventListener('click', closeBulkAddModal);
    bulkAddModalOverlay.addEventListener('click', function (event) {
        if (event.target === bulkAddModalOverlay) {
            closeBulkAddModal();
        }
    });
    bulkAddModalForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const user = auth.currentUser;
        if (!user || bulkAddRunning) return;
        await bulkAddTickers(user, bulkAddModalInput.value);
    });
}

async function onImportFileChosen() {
    const file = bulkAddFileInput.files && bulkAddFileInput.files[0];
    bulkAddFileInput.value = ''; // so picking the same file again re-triggers
    if (!file) return;
    let parsed;
    try {
        parsed = parseImportFile(await file.text());
    } catch (error) {
        console.error('Error reading import file: ', error);
        setBulkAddStatus("Couldn't read that file.");
        return;
    }
    if (!parsed.ok) {
        bulkAddPendingImport = null;
        setBulkAddStatus(parsed.error);
        return;
    }
    bulkAddPendingImport = parsed;
    bulkAddModalInput.value = parsed.tickers.join(', ');
    const lists = parsed.watchlists.length;
    setBulkAddStatus(`Loaded ${parsed.tickers.length} stocks and ${lists} watchlist${lists === 1 ? '' : 's'} from ${file.name}. Click Add to import.`);
}

function openBulkAddModal() {
    bulkAddPendingImport = null;
    bulkAddModalInput.value = '';
    setBulkAddStatus('');
    bulkAddFolderIds = new Set(watchlistState.currentFolderId ? [watchlistState.currentFolderId] : []);
    renderBulkAddFolders();
    bulkAddModalOverlay.classList.remove('hidden');
    bulkAddModalInput.focus();
}

function closeBulkAddModal() {
    if (bulkAddRunning) return; // don't orphan an in-flight batch
    bulkAddModalOverlay.classList.add('hidden');
}

// Checkbox list of the user's watchlists. "All" is shown locked on (same as
// the single-stock folder modal) since every saved stock appears in All Stocks.
function renderBulkAddFolders() {
    bulkAddFolders.innerHTML = '';
    const folders = getCachedFolders();

    const heading = document.createElement('p');
    heading.className = 'section-label';
    heading.textContent = 'Add to:';
    bulkAddFolders.appendChild(heading);

    const allRow = document.createElement('label');
    allRow.className = 'opt is-static is-disabled';
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.className = 'check';
    allCheckbox.checked = true;
    allCheckbox.disabled = true;
    const allName = document.createElement('span');
    allName.className = 'truncate font-semibold';
    allName.textContent = 'All';
    allRow.appendChild(allCheckbox);
    allRow.appendChild(allName);
    bulkAddFolders.appendChild(allRow);

    folders.forEach((folder) => {
        const row = document.createElement('label');
        row.className = 'opt cursor-pointer';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'check';
        checkbox.checked = bulkAddFolderIds.has(folder.id);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                bulkAddFolderIds.add(folder.id);
            } else {
                bulkAddFolderIds.delete(folder.id);
            }
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'truncate';
        nameSpan.textContent = folder.name;

        row.appendChild(checkbox);
        row.appendChild(nameSpan);
        bulkAddFolders.appendChild(row);
    });
}

function setBulkAddStatus(text) {
    bulkAddModalStatus.textContent = text;
    bulkAddModalStatus.classList.toggle('hidden', !text);
}

// Adds every ticker in `rawText` to the watchlist (and to the currently
// watchlist folders ticked in the modal). Each ticker goes through the same
// fetch → calculate → stock-info steps as a refresh in updateWatchListValues(),
// then all successes are written to Firestore in a single batch.
//
// The input can also be a StockZ export (.json) — pasted, or picked with the
// file button. Then each ticker also joins the watchlists it was in, created by
// name if missing, and tickers already saved just gain those watchlists.
async function bulkAddTickers(user, rawText) {
    const pastedJson = looksLikeJson(rawText);
    const imported = pastedJson ? parseImportFile(rawText) : bulkAddPendingImport;
    if (imported && !imported.ok) {
        setBulkAddStatus(imported.error);
        return;
    }
    const folderNamesFor = (ticker) => imported?.tickerFolders.get(ticker) || [];
    const maxTickers = imported ? BULK_ADD_MAX_IMPORT_TICKERS : BULK_ADD_MAX_TICKERS;

    const existing = new Set(getCachedWatchList().map(item => item.ticker));
    const { invalid, alreadyAdded, toAdd } = parseBulkTickers(pastedJson ? imported.tickers.join(' ') : rawText, existing);
    if (pastedJson) invalid.push(...imported.invalid);

    if (toAdd.length > maxTickers) {
        setBulkAddStatus(`Too many tickers (${toAdd.length}). Please add at most ${maxTickers} at a time.`);
        return;
    }
    const mergeTickers = alreadyAdded.filter(ticker => folderNamesFor(ticker).length > 0);
    if (toAdd.length === 0 && mergeTickers.length === 0) {
        const problems = [];
        if (invalid.length) problems.push(`Invalid: ${invalid.join(', ')}`);
        if (alreadyAdded.length) problems.push(`Already on your watch list: ${alreadyAdded.join(', ')}`);
        setBulkAddStatus(problems.length ? problems.join('. ') : 'Enter at least one ticker.');
        return;
    }

    bulkAddRunning = true;
    bulkAddModalSubmitBtn.disabled = true;
    bulkAddModalInput.disabled = true;

    // Resolve imported watchlist names to folder ids, creating the missing ones.
    const idByName = new Map(getCachedFolders().map(folder => [folder.name.toLowerCase(), folder.id]));
    const neededNames = new Set([...toAdd, ...mergeTickers].flatMap(folderNamesFor));
    let foldersFailed = [];
    if (neededNames.size > 0) setBulkAddStatus('Setting up watchlists…');
    for (const name of neededNames) {
        if (idByName.has(name.toLowerCase())) continue;
        const folder = await createFolder(user.uid, name);
        if (folder) idByName.set(name.toLowerCase(), folder.id);
        else foldersFailed.push(name);
    }
    const importedFolderIds = (ticker) => folderNamesFor(ticker)
        .map(name => idByName.get(name.toLowerCase()))
        .filter(Boolean);

    // Tickers already saved: just add the imported watchlists to them.
    let merged = 0;
    for (const ticker of mergeTickers) {
        const item = getCachedWatchList().find(candidate => candidate.ticker === ticker);
        const current = Array.isArray(item?.folderIds) ? item.folderIds : [];
        const next = [...new Set([...current, ...importedFolderIds(ticker)])];
        if (next.length === current.length) continue;
        try {
            await saveWatchlistItemFolders(user.uid, ticker, next);
            setCachedWatchList(getCachedWatchList().map(candidate => candidate.ticker === ticker ? { ...candidate, folderIds: next } : candidate));
            merged++;
        } catch (error) {
            console.error(`Error updating watchlists for ${ticker}: `, error);
        }
    }

    const baseFolderIds = Array.from(bulkAddFolderIds);
    const failed = [];
    let finished = 0;
    setBulkAddStatus(`Adding 0/${toAdd.length}…`);

    const results = await mapWithConcurrencyLimit(toAdd, 4, async (ticker) => {
        try {
            const data = await getStockData(ticker, 'mostRecentData');
            const calculations = runStockCalculations(data.prices, ticker);
            let info = {};
            try {
                info = await fetchStockInfo(ticker);
            } catch (error) {
                console.error(`Error fetching stock info for ${ticker}: `, error);
            }
            return {
                ticker,
                goodBuyPrice: calculations.greatBRLow.toFixed(2),
                badBuyPrice: calculations.badBRHigh.toFixed(2),
                name: info.name || null,
                currentPrice: info.currentPrice ?? null,
                lifetimeStartPrice: calculations.lifetimeStartPrice ?? null,
                dividendYield: info.dividendYield || null,
                bandsUpdatedAt: Date.now(),
                folderIds: [...new Set([...baseFolderIds, ...importedFolderIds(ticker)])]
            };
        } catch (error) {
            console.error(`Error adding ${ticker} in bulk: `, error);
            failed.push(ticker);
            return null;
        } finally {
            finished++;
            setBulkAddStatus(`Adding ${finished}/${toAdd.length}…`);
        }
    });

    const entries = results.filter(Boolean);
    let saveFailed = false;
    if (entries.length > 0) {
        try {
            await saveWatchlistItems(user.uid, entries);

            const addedTickers = new Set(entries.map(entry => entry.ticker));
            setCachedWatchList([...getCachedWatchList().filter(item => !addedTickers.has(item.ticker)), ...entries]);
            renderFolderDropdown(getCachedFolders());
            notifyWatchlistChanged();
        } catch (error) {
            console.error('Error saving bulk-added watchlist items: ', error);
            saveFailed = true;
        }
    }

    bulkAddRunning = false;
    bulkAddModalSubmitBtn.disabled = false;
    bulkAddModalInput.disabled = false;

    if (saveFailed) {
        setBulkAddStatus("Couldn't save these stocks to your watch list. Please try again.");
        return;
    }

    // Folders may have been created or filled even if no new stock was added.
    renderFolderDropdown(getCachedFolders());
    notifyWatchlistChanged();

    const notes = [`Added ${entries.length}.`];
    if (merged) notes.push(`Updated watchlists on ${merged} existing stock${merged === 1 ? '' : 's'}.`);
    if (foldersFailed.length) notes.push(`Couldn't create watchlists: ${foldersFailed.join(', ')}.`);
    if (failed.length) notes.push(`Couldn't load: ${failed.join(', ')}.`);
    if (invalid.length) notes.push(`Invalid: ${invalid.join(', ')}.`);
    if (alreadyAdded.length) notes.push(`Already on your watch list: ${alreadyAdded.join(', ')}.`);
    if (notes.length === 1 && merged === 0) {
        closeBulkAddModal();
    } else {
        setBulkAddStatus(notes.join(' '));
    }
}
