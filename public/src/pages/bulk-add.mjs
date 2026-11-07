/* Bulk-add modal, opened from the "Bulk Add" button next to the folder dropdown. */
import { auth } from '../lib/firebase.mjs';
import { getCachedFolders, getCachedWatchList, setCachedWatchList } from '../lib/storage.mjs';
import { saveWatchlistItems } from '../lib/watchlist-repo.mjs';
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
const BULK_ADD_MAX_TICKERS     = 50;
let bulkAddRunning             = false;
let bulkAddFolderIds           = new Set();

if (bulkAddModalOverlay) {
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

function openBulkAddModal() {
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
async function bulkAddTickers(user, rawText) {
    const existing = new Set(getCachedWatchList().map(item => item.ticker));
    const { invalid, alreadyAdded, toAdd } = parseBulkTickers(rawText, existing);

    if (toAdd.length > BULK_ADD_MAX_TICKERS) {
        setBulkAddStatus(`Too many tickers (${toAdd.length}). Please add at most ${BULK_ADD_MAX_TICKERS} at a time.`);
        return;
    }
    if (toAdd.length === 0) {
        const problems = [];
        if (invalid.length) problems.push(`Invalid: ${invalid.join(', ')}`);
        if (alreadyAdded.length) problems.push(`Already on your watch list: ${alreadyAdded.join(', ')}`);
        setBulkAddStatus(problems.length ? problems.join('. ') : 'Enter at least one ticker.');
        return;
    }

    bulkAddRunning = true;
    bulkAddModalSubmitBtn.disabled = true;
    bulkAddModalInput.disabled = true;

    const folderIds = Array.from(bulkAddFolderIds);
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
                folderIds
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

    const notes = [`Added ${entries.length}.`];
    if (failed.length) notes.push(`Couldn't load: ${failed.join(', ')}.`);
    if (invalid.length) notes.push(`Invalid: ${invalid.join(', ')}.`);
    if (alreadyAdded.length) notes.push(`Already on your watch list: ${alreadyAdded.join(', ')}.`);
    if (notes.length === 1) {
        closeBulkAddModal();
    } else {
        setBulkAddStatus(notes.join(' '));
    }
}
