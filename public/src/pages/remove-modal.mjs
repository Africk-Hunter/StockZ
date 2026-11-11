/* Remove modal, opened from the "Remove" button next to "Export": a flat,
   A–Z, searchable list of stocks. Tick any number (or "Select all" for the
   stocks currently shown) and delete them from the watch list in one go.
   The selection survives changing the search text. */
import { getCachedWatchList } from '../lib/storage.mjs';
import { deleteManyFromFirebase } from '../lib/watchlist-repo.mjs';
import { notifyWatchlistChanged } from '../lib/events.mjs';
import { openDeleteConfirmModal } from './delete-modal.mjs';

const removeBtn            = document.getElementById("removeBtn");
const removeModalOverlay   = document.getElementById("removeModalOverlay");
const removeModalForm      = document.getElementById("removeModalForm");
const removeModalSearch    = document.getElementById("removeModalSearch");
const removeModalList      = document.getElementById("removeModalList");
const removeModalSummary   = document.getElementById("removeModalSummary");
const removeModalCloseBtn  = document.getElementById("removeModalCloseBtn");
const removeModalCancelBtn = document.getElementById("removeModalCancelBtn");
const removeModalSubmitBtn = document.getElementById("removeModalSubmitBtn");

const CHECKBOX_CLASS = 'check disabled:cursor-default';

let allItems = [];
let visibleTickers = [];
let selectedTickers = new Set();
let allCheckbox = null;
let rowCheckboxes = new Map();

if (removeModalOverlay) {
    removeBtn.addEventListener('click', openRemoveModal);
    removeModalCloseBtn.addEventListener('click', closeRemoveModal);
    removeModalCancelBtn.addEventListener('click', closeRemoveModal);
    removeModalOverlay.addEventListener('click', function (event) {
        if (event.target === removeModalOverlay) closeRemoveModal();
    });
    removeModalSearch.addEventListener('input', renderList);
    removeModalForm.addEventListener('submit', function (event) {
        event.preventDefault();
        removeSelection();
    });
}

function openRemoveModal() {
    allItems = [...getCachedWatchList()].sort((a, b) => a.ticker.localeCompare(b.ticker));
    selectedTickers = new Set();
    removeModalSearch.value = '';
    renderList();
    removeModalOverlay.classList.remove('hidden');
}

function closeRemoveModal() {
    removeModalOverlay.classList.add('hidden');
}

function renderList() {
    const query = removeModalSearch.value.trim().toLowerCase();
    const items = query
        ? allItems.filter(item => item.ticker.toLowerCase().includes(query) || (item.name || '').toLowerCase().includes(query))
        : allItems;
    visibleTickers = items.map(item => item.ticker);

    removeModalList.innerHTML = '';
    rowCheckboxes = new Map();
    allCheckbox = null;

    if (items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'bg-canopy text-small text-sand text-center py-4';
        empty.textContent = allItems.length === 0 ? 'Your watch list is empty.' : 'No stocks match your search.';
        removeModalList.appendChild(empty);
        syncList();
        return;
    }

    const allRow = document.createElement('label');
    allRow.className = 'opt cursor-pointer';
    allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.className = CHECKBOX_CLASS;
    allCheckbox.addEventListener('change', () => {
        visibleTickers.forEach(ticker => allCheckbox.checked ? selectedTickers.add(ticker) : selectedTickers.delete(ticker));
        syncList();
    });
    const allName = document.createElement('span');
    allName.className = 'font-semibold';
    allName.textContent = query ? 'Select all results' : 'Select all';
    allRow.appendChild(allCheckbox);
    allRow.appendChild(allName);
    removeModalList.appendChild(allRow);

    items.forEach((item) => {
        const row = document.createElement('label');
        row.className = 'opt cursor-pointer';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = CHECKBOX_CLASS;
        checkbox.dataset.ticker = item.ticker;
        checkbox.addEventListener('change', () => {
            checkbox.checked ? selectedTickers.add(item.ticker) : selectedTickers.delete(item.ticker);
            syncList();
        });
        rowCheckboxes.set(item.ticker, checkbox);

        const tickerSpan = document.createElement('span');
        tickerSpan.className = 'caps text-label tracking-caps-label flex-shrink-0';
        tickerSpan.textContent = item.ticker;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'truncate text-small text-sand';
        nameSpan.textContent = item.name || '';

        row.appendChild(checkbox);
        row.appendChild(tickerSpan);
        row.appendChild(nameSpan);
        removeModalList.appendChild(row);
    });
    syncList();
}

function syncList() {
    const count = selectedTickers.size;
    rowCheckboxes.forEach((checkbox, ticker) => { checkbox.checked = selectedTickers.has(ticker); });
    if (allCheckbox) {
        const visibleSelected = visibleTickers.filter(ticker => selectedTickers.has(ticker)).length;
        allCheckbox.checked = visibleSelected > 0 && visibleSelected === visibleTickers.length;
        allCheckbox.indeterminate = visibleSelected > 0 && visibleSelected < visibleTickers.length;
    }
    removeModalSummary.textContent = `${count} of ${allItems.length} selected`;
    removeModalSubmitBtn.disabled = count === 0;
    removeModalSubmitBtn.textContent = count === 0 ? 'Remove' : `Remove ${count}`;
}

// Asks for confirmation first; cancelling leaves this modal open with the
// selection intact.
function removeSelection() {
    if (selectedTickers.size === 0) return;
    const tickers = [...selectedTickers];
    const label = tickers.length === 1 ? tickers[0] : `${tickers.length} stocks`;
    openDeleteConfirmModal(label, async function () {
        const deleted = await deleteManyFromFirebase(tickers);
        closeRemoveModal();
        if (deleted.length > 0) notifyWatchlistChanged();
        if (deleted.length < tickers.length) {
            alert(`Couldn't remove ${tickers.length - deleted.length} of ${tickers.length} stocks. Please try again.`);
        }
    });
}
