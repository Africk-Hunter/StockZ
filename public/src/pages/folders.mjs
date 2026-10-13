/* Watch List Folders: the folder dropdown, the "which watchlist?" picker modal
   (also opened from the Ticker Info page) and the rename modal. Changes that
   other parts of the page care about are announced via notifyWatchlistChanged(). */
import { auth } from '../lib/firebase.mjs';
import {
    getCachedFolders, setCachedFolders, getCachedWatchList, setCachedWatchList
} from '../lib/storage.mjs';
import {
    fetchWatchlistFolders, createFolder, renameFolder, deleteFolder,
    deleteFromFirebase, saveWatchlistItem, saveWatchlistItemFolders
} from '../lib/watchlist-repo.mjs';
import { notifyWatchlistChanged } from '../lib/events.mjs';
import { watchlistState } from './watchlist-state.mjs';
import { openDeleteConfirmModal } from './delete-modal.mjs';

let folderDropdownWrapper   = document.getElementById("folderDropdownWrapper");
let folderDropdownBtn       = document.getElementById("folderDropdownBtn");
let folderDropdownLabel     = document.getElementById("folderDropdownLabel");
let folderDropdownPanel     = document.getElementById("folderDropdownPanel");
let folderModalOverlay      = document.getElementById("folderModalOverlay");
let folderModalTitle        = document.getElementById("folderModalTitle");
let folderModalCloseBtn     = document.getElementById("folderModalCloseBtn");
let folderModalList         = document.getElementById("folderModalList");
let folderModalNewFolderForm  = document.getElementById("folderModalNewFolderForm");
let folderModalNewFolderInput = document.getElementById("folderModalNewFolderInput");
let folderModalAddBtn       = document.getElementById("folderModalAddBtn");
let renameFolderModalOverlay   = document.getElementById("renameFolderModalOverlay");
let renameFolderModalForm      = document.getElementById("renameFolderModalForm");
let renameFolderModalInput     = document.getElementById("renameFolderModalInput");
let renameFolderModalCloseBtn  = document.getElementById("renameFolderModalCloseBtn");
let renameFolderModalCancelBtn = document.getElementById("renameFolderModalCancelBtn");
let renameFolderModalSaveBtn   = document.getElementById("renameFolderModalSaveBtn");

let currentModalTicker      = null;
// The folder currently being renamed in the rename modal.
let renamingFolder          = null;
// Watchlist selections made inside the folder modal are staged here and only
// written to Firestore when folderModalAddBtn is clicked — checking/
// unchecking a box no longer writes immediately.
let pendingFolderIds        = new Set();
// Set by openFolderModal() when the modal is adding a ticker that isn't on
// the watchlist yet (see commitFolderSelection()); null while reorganizing
// an existing item's watchlists.
let pendingNewEntry         = null;
// False once "All" is unchecked on an existing item — saving then removes the
// ticker from the watchlist entirely (after a confirmation).
let pendingKeepInAll        = true;

// Folder dropdown (watchlist page only).
if (folderDropdownBtn) {
    folderDropdownBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        folderDropdownPanel.classList.toggle('hidden');
    });
    document.addEventListener('click', function (event) {
        if (!folderDropdownWrapper.contains(event.target)) {
            folderDropdownPanel.classList.add('hidden');
        }
    });
}

// Folder ("which watchlist?") picker modal — also opened from the Ticker
// Info page right after adding a ticker, not just from the Watch List page.
if (folderModalOverlay) {
    folderModalCloseBtn.addEventListener('click', closeFolderModal);
    folderModalOverlay.addEventListener('click', function (event) {
        if (event.target === folderModalOverlay) {
            closeFolderModal();
        }
    });
    folderModalNewFolderForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const name = folderModalNewFolderInput.value.trim();
        const user = auth.currentUser;
        if (!name || !user || !currentModalTicker) return;

        const folder = await createFolderOrAlert(user.uid, name);
        if (!folder) return;
        // Stage it as selected — actual ticker membership is only written
        // when folderModalAddBtn is clicked, same as the existing checkboxes.
        pendingFolderIds.add(folder.id);
        folderModalNewFolderInput.value = '';
        renderFolderModalList();
        renderFolderDropdown(getCachedFolders());
    });
    folderModalAddBtn.addEventListener('click', commitFolderSelection);
}

// Rename-watchlist modal, opened from the ✎ button in the folder dropdown.
if (renameFolderModalOverlay) {
    renameFolderModalCloseBtn.addEventListener('click', closeRenameFolderModal);
    renameFolderModalCancelBtn.addEventListener('click', closeRenameFolderModal);
    renameFolderModalOverlay.addEventListener('click', function (event) {
        if (event.target === renameFolderModalOverlay) {
            closeRenameFolderModal();
        }
    });
    renameFolderModalForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const user = auth.currentUser;
        const name = renameFolderModalInput.value.trim();
        if (!renamingFolder || !user) return;
        if (!name || name === renamingFolder.name) {
            closeRenameFolderModal();
            return;
        }
        renameFolderModalSaveBtn.disabled = true;
        const success = await renameFolderOrAlert(user.uid, renamingFolder.id, name);
        renameFolderModalSaveBtn.disabled = false;
        if (!success) return;
        renderFolderDropdown(getCachedFolders());
        closeRenameFolderModal();
    });
}

async function createFolderOrAlert(uid, name) {
    const folder = await createFolder(uid, name);
    if (!folder) alert("Couldn't save the new watchlist to your account. Please try again.");
    return folder;
}

async function renameFolderOrAlert(uid, folderId, name) {
    const success = await renameFolder(uid, folderId, name);
    if (!success) {
        alert("Couldn't rename the watchlist. Please try again.");
        return false;
    }
    if (watchlistState.currentFolderId === folderId) {
        folderDropdownLabel.textContent = name;
    }
    return true;
}

async function deleteFolderOrAlert(uid, folderId) {
    const success = await deleteFolder(uid, folderId);
    if (!success) {
        alert("Couldn't delete the watchlist. Please try again.");
        return false;
    }
    if (watchlistState.currentFolderId === folderId) {
        watchlistState.currentFolderId = null;
        folderDropdownLabel.textContent = 'All Stocks';
    }
    return true;
}

export async function initWatchlistFolders(user) {
    const folders = await fetchWatchlistFolders(user.uid);
    setCachedFolders(folders);
    renderFolderDropdown(folders);
}

export function renderFolderDropdown(folders) {
    if (!folderDropdownPanel) return;
    const currentFolderId = watchlistState.currentFolderId;
    folderDropdownPanel.innerHTML = '';
    const watchList = getCachedWatchList();

    const allRow = document.createElement('button');
    allRow.type = 'button';
    allRow.className = 'flex justify-between items-center gap-2 w-full px-3 py-2 text-left hover:bg-text-color hover:bg-opacity-10 transition-colors duration-150' + (currentFolderId === null ? ' text-accent-color font-semibold' : '');
    allRow.innerHTML = `<span>All Stocks</span><span class="opacity-60">${watchList.length}</span>`;
    allRow.addEventListener('click', () => selectFolder(null, 'All Stocks'));
    folderDropdownPanel.appendChild(allRow);

    folders.forEach((folder) => {
        const count = watchList.filter(item => Array.isArray(item.folderIds) && item.folderIds.includes(folder.id)).length;

        const row = document.createElement('div');
        row.className = 'flex items-center gap-1 px-2 py-1 hover:bg-text-color hover:bg-opacity-10 transition-colors duration-150';

        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'flex justify-between items-center gap-2 flex-1 min-w-0 text-left' + (currentFolderId === folder.id ? ' text-accent-color font-semibold' : '');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'truncate';
        nameSpan.textContent = folder.name;
        const countSpan = document.createElement('span');
        countSpan.className = 'opacity-60 flex-shrink-0';
        countSpan.textContent = count;
        selectBtn.appendChild(nameSpan);
        selectBtn.appendChild(countSpan);
        selectBtn.addEventListener('click', () => selectFolder(folder.id, folder.name));

        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'flex-shrink-0 opacity-40 hover:opacity-100 hover:text-accent-color px-1';
        renameBtn.textContent = '✎';
        renameBtn.title = `Rename watchlist "${folder.name}"`;
        renameBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            folderDropdownPanel.classList.add('hidden');
            openRenameFolderModal(folder);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'flex-shrink-0 opacity-40 hover:opacity-100 hover:text-desperate-buy-one px-1';
        deleteBtn.textContent = '✕';
        deleteBtn.title = `Delete watchlist "${folder.name}"`;
        deleteBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const user = auth.currentUser;
            if (!user) return;
            if (confirm(`Delete watchlist "${folder.name}"? Stocks will stay in your watchlist.`)) {
                const wasActiveFilter = watchlistState.currentFolderId === folder.id;
                const success = await deleteFolderOrAlert(user.uid, folder.id);
                if (!success) return;
                renderFolderDropdown(getCachedFolders());
                if (wasActiveFilter) {
                    notifyWatchlistChanged();
                }
            }
        });

        row.appendChild(selectBtn);
        row.appendChild(renameBtn);
        row.appendChild(deleteBtn);
        folderDropdownPanel.appendChild(row);
    });

    const divider = document.createElement('div');
    divider.className = 'border-t border-text-color border-opacity-20 my-1';
    folderDropdownPanel.appendChild(divider);

    const newFolderForm = document.createElement('form');
    newFolderForm.className = 'flex gap-1 px-2 py-1';
    const newFolderInput = document.createElement('input');
    newFolderInput.type = 'text';
    newFolderInput.placeholder = 'New watchlist';
    newFolderInput.maxLength = 40;
    newFolderInput.autocomplete = 'off';
    newFolderInput.className = 'flex-1 min-w-0 bg-background rounded px-2 py-1 text-text-color placeholder-text-color placeholder-opacity-50 outline-none text-xs laptop:text-sm';
    const newFolderSubmit = document.createElement('button');
    newFolderSubmit.type = 'submit';
    newFolderSubmit.className = 'flex-shrink-0 bg-accent-color text-background rounded px-2 text-xs laptop:text-sm font-semibold';
    newFolderSubmit.textContent = '+';
    newFolderForm.appendChild(newFolderInput);
    newFolderForm.appendChild(newFolderSubmit);
    newFolderForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = newFolderInput.value.trim();
        const user = auth.currentUser;
        if (!name || !user) return;
        const folder = await createFolderOrAlert(user.uid, name);
        if (!folder) return;
        renderFolderDropdown(getCachedFolders());
    });
    folderDropdownPanel.appendChild(newFolderForm);
}

function selectFolder(folderId, label) {
    watchlistState.currentFolderId = folderId;
    folderDropdownLabel.textContent = label;
    folderDropdownPanel.classList.add('hidden');
    renderFolderDropdown(getCachedFolders());
    notifyWatchlistChanged();
}

function openRenameFolderModal(folder) {
    renamingFolder = folder;
    renameFolderModalInput.value = folder.name;
    renameFolderModalOverlay.classList.remove('hidden');
    renameFolderModalInput.focus();
    renameFolderModalInput.select();
}

function closeRenameFolderModal() {
    renameFolderModalOverlay.classList.add('hidden');
    renamingFolder = null;
}

// `newEntry`, when passed, means `ticker` isn't on the watchlist yet — the
// modal is being used to add it for the first time (from the Ticker Info
// page's "Add To Watchlist" button) rather than to reorganize an existing
// item. Nothing is written to Firestore until commitFolderSelection() runs.
export function openFolderModal(ticker, newEntry = null) {
    const user = auth.currentUser;
    if (!user) {
        console.error("No user is signed in.");
        return;
    }
    currentModalTicker = ticker;
    pendingNewEntry = newEntry;
    const item = getCachedWatchList().find(watchListItem => watchListItem.ticker === ticker);
    const itemFolderIds = (item && Array.isArray(item.folderIds)) ? item.folderIds : [];
    pendingFolderIds = new Set(itemFolderIds);
    pendingKeepInAll = true;
    folderModalTitle.textContent = newEntry ? `Add ${ticker} to a Watchlist` : `Modify ${ticker} Watchlist(s)`;
    folderModalAddBtn.textContent = newEntry ? 'Add' : 'Save';
    renderFolderModalList();
    folderModalOverlay.classList.remove('hidden');
}

function closeFolderModal() {
    folderModalOverlay.classList.add('hidden');
    currentModalTicker = null;
    pendingFolderIds = new Set();
    pendingNewEntry = null;
    pendingKeepInAll = true;
}

// Writes the staged pendingFolderIds selection to Firestore in one shot,
// then closes the modal — nothing is saved until this runs. For a brand new
// ticker (pendingNewEntry set), this is also what actually adds it to the
// watchlist in the first place.
async function commitFolderSelection() {
    const user = auth.currentUser;
    if (!user || !currentModalTicker) return;

    const ticker = currentModalTicker;
    const folderIds = Array.from(pendingFolderIds);
    const newEntry = pendingNewEntry;

    if (!newEntry && !pendingKeepInAll) {
        openDeleteConfirmModal(ticker, async function () {
            const success = await deleteFromFirebase(ticker);
            if (!success) {
                alert(`Couldn't remove ${ticker} from your watchlist. Please try again.`);
                return;
            }
            setCachedWatchList(getCachedWatchList().filter(item => item.ticker !== ticker));
            notifyWatchlistChanged({ ticker, inWatchlist: false });
            closeFolderModal();
        });
        return;
    }

    folderModalAddBtn.disabled = true;
    let newCacheEntry = null;
    try {
        if (newEntry) {
            const info = await newEntry.infoPromise;
            newCacheEntry = {
                ticker,
                goodBuyPrice: newEntry.goodBuyPrice,
                badBuyPrice: newEntry.badBuyPrice,
                name: info.name || null,
                currentPrice: info.currentPrice ?? null,
                dividendYield: info.dividendYield || null,
                bandsUpdatedAt: Date.now(),
                folderIds
            };
            await saveWatchlistItem(user.uid, newCacheEntry);
        } else {
            await saveWatchlistItemFolders(user.uid, ticker, folderIds);
        }
    } catch (e) {
        console.error("Error saving watchlist item: ", e);
        alert("Couldn't save this stock to your watchlist. Please try again.");
        folderModalAddBtn.disabled = false;
        return;
    }
    folderModalAddBtn.disabled = false;

    const existingList = getCachedWatchList();
    setCachedWatchList(newCacheEntry
        ? [...existingList.filter(item => item.ticker !== ticker), newCacheEntry]
        : existingList.map((item) => item.ticker === ticker ? { ...item, folderIds } : item));

    renderFolderDropdown(getCachedFolders());
    notifyWatchlistChanged(newCacheEntry ? { ticker, inWatchlist: true } : { ticker });
    closeFolderModal();
}

// Every watchlist item belongs to the unfiltered "All" list. For a ticker
// that's already saved, unchecking "All" stages a full removal (confirmed in
// commitFolderSelection()); for a ticker being added it stays locked on.
function createAllWatchlistRow() {
    const editable = !pendingNewEntry;
    const row = document.createElement('label');
    row.className = 'flex items-center gap-2 px-2 py-2 rounded' + (editable ? ' hover:bg-secondary-color cursor-pointer' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'accent-accent-color w-4 h-4 laptop:w-5 laptop:h-5 flex-shrink-0' + (editable ? '' : ' opacity-60');
    checkbox.checked = pendingKeepInAll;
    checkbox.disabled = !editable;
    checkbox.addEventListener('change', () => {
        pendingKeepInAll = checkbox.checked;
        renderFolderModalList();
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'truncate font-semibold';
    nameSpan.textContent = 'All';

    row.appendChild(checkbox);
    row.appendChild(nameSpan);
    return row;
}

function renderFolderModalList() {
    folderModalList.innerHTML = '';
    const folders = getCachedFolders();

    folderModalList.appendChild(createAllWatchlistRow());

    if (folders.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-text-color text-opacity-60 text-sm text-center py-2';
        empty.textContent = 'No watchlists yet. Create one below.';
        folderModalList.appendChild(empty);
        return;
    }

    const divider = document.createElement('div');
    divider.className = 'border-t border-text-color border-opacity-20 my-1';
    folderModalList.appendChild(divider);

    folders.forEach((folder) => {
        const row = document.createElement('label');
        row.className = 'flex items-center gap-2 px-2 py-2 rounded ' + (pendingKeepInAll ? 'hover:bg-secondary-color cursor-pointer' : 'opacity-50');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'accent-accent-color w-4 h-4 laptop:w-5 laptop:h-5 flex-shrink-0';
        checkbox.checked = pendingKeepInAll && pendingFolderIds.has(folder.id);
        checkbox.disabled = !pendingKeepInAll;
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                pendingFolderIds.add(folder.id);
            } else {
                pendingFolderIds.delete(folder.id);
            }
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'truncate';
        nameSpan.textContent = folder.name;

        row.appendChild(checkbox);
        row.appendChild(nameSpan);
        folderModalList.appendChild(row);
    });
}
