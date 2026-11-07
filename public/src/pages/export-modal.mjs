/* Export modal, opened from the "Export" button next to "Bulk Add": pick whole
   watchlists and/or individual stocks, then download them as an importable
   .json or a readable .txt file (contents built in lib/watchlist-export.mjs).

   The selection is a set of tickers. Every checkbox in the tree ("All stocks",
   a watchlist, a single stock) covers some tickers, and its checked /
   indeterminate state is derived from the selection in syncTree() — so a stock
   that sits in two watchlists is ticked or unticked in both at once. */
import { getCachedFolders, getCachedWatchList } from '../lib/storage.mjs';
import {
    groupWatchlistItems, serializeImportableExport, formatReadableExport, exportFileName
} from '../lib/watchlist-export.mjs';
import { watchlistState } from './watchlist-state.mjs';

const exportBtn               = document.getElementById("exportBtn");
const exportModalOverlay      = document.getElementById("exportModalOverlay");
const exportModalForm         = document.getElementById("exportModalForm");
const exportModalTree         = document.getElementById("exportModalTree");
const exportModalSummary      = document.getElementById("exportModalSummary");
const exportModalCloseBtn     = document.getElementById("exportModalCloseBtn");
const exportModalCancelBtn    = document.getElementById("exportModalCancelBtn");
const exportModalSubmitBtn    = document.getElementById("exportModalSubmitBtn");
const exportFormatReadable    = document.getElementById("exportFormatReadable");

const CHECKBOX_CLASS = 'accent-accent-color w-4 h-4 laptop:w-5 laptop:h-5 flex-shrink-0 cursor-pointer disabled:cursor-default';
const CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 flex-shrink-0 opacity-60 transition-transform duration-150"><path d="M9 6l6 6-6 6"/></svg>';

// Watchlist data as of opening the modal, so the tree and the file agree.
let exportItems = [];
let exportFolders = [];
let selectedTickers = new Set();
// { checkbox, tickers, countEl } for every checkbox in the tree.
let treeControls = [];

if (exportModalOverlay) {
    exportBtn.addEventListener('click', openExportModal);
    exportModalCloseBtn.addEventListener('click', closeExportModal);
    exportModalCancelBtn.addEventListener('click', closeExportModal);
    exportModalOverlay.addEventListener('click', function (event) {
        if (event.target === exportModalOverlay) {
            closeExportModal();
        }
    });
    exportModalForm.addEventListener('submit', function (event) {
        event.preventDefault();
        exportSelection();
    });
}

// Starts with the folder being viewed selected (and expanded), or everything
// when viewing All Stocks — same default as Bulk Add's folder choice.
function openExportModal() {
    exportItems = getCachedWatchList();
    exportFolders = getCachedFolders();
    const groups = groupWatchlistItems(exportItems, exportFolders);
    const currentGroup = groups.find(group => group.id !== null && group.id === watchlistState.currentFolderId);
    selectedTickers = new Set((currentGroup ? currentGroup.items : exportItems).map(item => item.ticker));

    renderTree(groups, currentGroup ? currentGroup.id : undefined);
    syncTree();
    exportModalOverlay.classList.remove('hidden');
}

function closeExportModal() {
    exportModalOverlay.classList.add('hidden');
}

function renderTree(groups, expandedGroupId) {
    exportModalTree.innerHTML = '';
    treeControls = [];

    if (exportItems.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-text-color text-opacity-60 text-sm text-center py-4';
        empty.textContent = 'Your watch list is empty.';
        exportModalTree.appendChild(empty);
        return;
    }

    const allRow = document.createElement('label');
    allRow.className = 'flex items-center gap-2 px-2 py-2 rounded hover:bg-secondary-color hover:bg-opacity-40 cursor-pointer';
    const allCheckbox = createCheckbox(exportItems.map(item => item.ticker));
    allCheckbox.dataset.exportAll = 'true';
    const allName = document.createElement('span');
    allName.className = 'font-semibold';
    allName.textContent = 'All stocks';
    allRow.appendChild(allCheckbox);
    allRow.appendChild(allName);
    exportModalTree.appendChild(allRow);

    const divider = document.createElement('div');
    divider.className = 'border-t border-text-color border-opacity-20 my-1';
    exportModalTree.appendChild(divider);

    groups.forEach((group) => {
        exportModalTree.appendChild(createGroup(group, group.id === expandedGroupId));
    });
}

// A watchlist row (checkbox + expand toggle) and its, initially collapsed,
// list of stocks.
function createGroup(group, expanded) {
    const tickers = group.items.map(item => item.ticker);
    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col';
    wrapper.dataset.exportGroup = group.id ?? 'none';

    const header = document.createElement('div');
    header.className = 'flex items-center gap-2 px-2 py-1 rounded hover:bg-secondary-color hover:bg-opacity-40';

    const countEl = document.createElement('span');
    countEl.className = 'flex-shrink-0 text-xs laptop:text-sm opacity-60 tabular-nums';
    const checkbox = createCheckbox(tickers, countEl);
    checkbox.setAttribute('aria-label', `Select all stocks in ${group.name}`);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'flex items-center gap-2 flex-1 min-w-0 py-1 text-left';
    toggle.innerHTML = CHEVRON_SVG;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'truncate' + (group.id === null ? ' italic' : '');
    nameSpan.textContent = group.name;
    toggle.appendChild(nameSpan);
    const spacer = document.createElement('span');
    spacer.className = 'flex-1';
    toggle.appendChild(spacer);
    toggle.appendChild(countEl);

    header.appendChild(checkbox);
    header.appendChild(toggle);
    wrapper.appendChild(header);

    if (tickers.length === 0) {
        checkbox.disabled = true;
        toggle.disabled = true;
        toggle.classList.add('opacity-50');
        return wrapper;
    }

    const list = document.createElement('div');
    list.className = 'flex flex-col ml-6 laptop:ml-7 pl-2 border-l border-text-color border-opacity-20';
    group.items.forEach(item => list.appendChild(createStockRow(item)));
    wrapper.appendChild(list);

    const setExpanded = (open) => {
        list.classList.toggle('hidden', !open);
        toggle.querySelector('svg')?.classList.toggle('rotate-90', open);
        toggle.setAttribute('aria-expanded', String(open));
    };
    setExpanded(expanded);
    toggle.title = `Show stocks in ${group.name}`;
    toggle.addEventListener('click', () => setExpanded(list.classList.contains('hidden')));

    return wrapper;
}

function createStockRow(item) {
    const row = document.createElement('label');
    row.className = 'flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary-color hover:bg-opacity-40 cursor-pointer text-sm laptop:text-base';

    const checkbox = createCheckbox([item.ticker]);
    checkbox.dataset.ticker = item.ticker;

    const tickerSpan = document.createElement('span');
    tickerSpan.className = 'font-semibold flex-shrink-0';
    tickerSpan.textContent = item.ticker;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'truncate text-xs laptop:text-sm opacity-60';
    nameSpan.textContent = item.name || '';

    row.appendChild(checkbox);
    row.appendChild(tickerSpan);
    row.appendChild(nameSpan);
    return row;
}

// A checkbox that selects/deselects `tickers`. Clicking an indeterminate box
// makes the browser tick it, so that selects all of them.
function createCheckbox(tickers, countEl = null) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = CHECKBOX_CLASS;
    checkbox.addEventListener('change', () => {
        tickers.forEach(ticker => checkbox.checked ? selectedTickers.add(ticker) : selectedTickers.delete(ticker));
        syncTree();
    });
    treeControls.push({ checkbox, tickers, countEl });
    return checkbox;
}

function syncTree() {
    treeControls.forEach(({ checkbox, tickers, countEl }) => {
        const selected = tickers.filter(ticker => selectedTickers.has(ticker)).length;
        checkbox.checked = tickers.length > 0 && selected === tickers.length;
        checkbox.indeterminate = selected > 0 && selected < tickers.length;
        if (countEl) countEl.textContent = tickers.length === 0 ? 'Empty' : `${selected}/${tickers.length}`;
    });
    exportModalSummary.textContent = `${selectedTickers.size} of ${exportItems.length} selected`;
    exportModalSubmitBtn.disabled = selectedTickers.size === 0;
}

function exportSelection() {
    if (selectedTickers.size === 0) return;
    const now = new Date();
    if (exportFormatReadable.checked) {
        downloadTextFile(exportFileName('txt', now), formatReadableExport(exportItems, exportFolders, selectedTickers, now), 'text/plain');
    } else {
        downloadTextFile(exportFileName('json', now), serializeImportableExport(exportItems, exportFolders, selectedTickers, now), 'application/json');
    }
    closeExportModal();
}

function downloadTextFile(filename, text, mimeType) {
    const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking in the same tick can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
