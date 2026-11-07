/* Pure helpers for the watchlist export modal: grouping stocks by watchlist
   folder, and turning a selection of tickers into the contents of the
   importable (.json) or readable (.txt) file. No DOM, no storage.

   A selection is a Set of tickers. A folder is exported when at least one of
   its stocks is selected, and lists only its selected stocks — exactly what
   the modal's checkboxes show. */
import { getBuyTier } from './watchlist-logic.mjs';

export const EXPORT_FORMAT_ID = 'stockz-watchlist';
export const EXPORT_FORMAT_VERSION = 1;
export const NO_WATCHLIST_LABEL = 'No watchlist';

const byTicker = (a, b) => a.ticker.localeCompare(b.ticker);

function folderIdsOf(item) {
    return Array.isArray(item.folderIds) ? item.folderIds : [];
}

// One group per folder (folder order, stocks A–Z, empty folders kept), then a
// "No watchlist" group (id null) for stocks that aren't in any existing folder
// — ids left behind by a deleted folder don't count. That group is omitted
// when empty.
export function groupWatchlistItems(items, folders) {
    const existingFolderIds = new Set(folders.map(folder => folder.id));
    const groups = folders.map(folder => ({
        id: folder.id,
        name: folder.name,
        items: items.filter(item => folderIdsOf(item).includes(folder.id)).sort(byTicker)
    }));
    const unfiled = items
        .filter(item => !folderIdsOf(item).some(id => existingFolderIds.has(id)))
        .sort(byTicker);
    if (unfiled.length > 0) {
        groups.push({ id: null, name: NO_WATCHLIST_LABEL, items: unfiled });
    }
    return groups;
}

// The groups narrowed to the selected stocks, dropping groups left empty.
function selectedGroups(items, folders, selectedTickers) {
    return groupWatchlistItems(items, folders)
        .map(group => ({ ...group, items: group.items.filter(item => selectedTickers.has(item.ticker)) }))
        .filter(group => group.items.length > 0);
}

function selectedItems(items, selectedTickers) {
    return items.filter(item => selectedTickers.has(item.ticker)).sort(byTicker);
}

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

// The importable file. Watchlists are referenced by name (folder ids are
// per-account Firestore ids, meaningless anywhere else) and list their
// tickers; each stock appears once in `stocks`.
export function buildImportableExport(items, folders, selectedTickers, now = new Date()) {
    return {
        format: EXPORT_FORMAT_ID,
        version: EXPORT_FORMAT_VERSION,
        exportedAt: now.toISOString(),
        watchlists: selectedGroups(items, folders, selectedTickers)
            .filter(group => group.id !== null)
            .map(group => ({ name: group.name, tickers: group.items.map(item => item.ticker) })),
        stocks: selectedItems(items, selectedTickers).map(item => ({
            ticker: item.ticker,
            name: item.name || null,
            currentPrice: toNumberOrNull(item.currentPrice),
            goodBuyPrice: toNumberOrNull(item.goodBuyPrice),
            badBuyPrice: toNumberOrNull(item.badBuyPrice),
            dividendYield: item.dividendYield || null,
            bandsUpdatedAt: item.bandsUpdatedAt ?? null
        }))
    };
}

export function serializeImportableExport(items, folders, selectedTickers, now = new Date()) {
    return JSON.stringify(buildImportableExport(items, folders, selectedTickers, now), null, 2) + '\n';
}

const TIER_LABELS = {
    below: 'Below range',
    great: 'Great buy',
    good: 'Good buy',
    okay: 'Okay buy',
    bad: 'Bad buy',
    above: 'Above range',
};
const MAX_NAME_LENGTH = 30;

// Plain ASCII placeholders/ellipsis so the file reads the same in any editor.
function money(value) {
    const number = toNumberOrNull(value);
    return number === null ? '-' : `$${number.toFixed(2)}`;
}

function truncate(text, max) {
    return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

function plural(count, word) {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// The readable file: a short header, then one aligned table per watchlist
// (a stock in several watchlists is listed under each). Every table shares the
// same column widths so the whole file lines up.
export function formatReadableExport(items, folders, selectedTickers, now = new Date()) {
    const header = ['Ticker', 'Name', 'Price', 'Good Buy', 'Bad Buy', 'Dividend', 'Zone'];
    const rowFor = (item) => [
        item.ticker,
        truncate(item.name || '-', MAX_NAME_LENGTH),
        money(item.currentPrice),
        money(item.goodBuyPrice),
        money(item.badBuyPrice),
        item.dividendYield || '-',
        TIER_LABELS[getBuyTier(item.currentPrice, item.goodBuyPrice, item.badBuyPrice)] ?? '-',
    ];

    const groups = selectedGroups(items, folders, selectedTickers)
        .map(group => ({ name: group.name, rows: group.items.map(rowFor) }));

    const widths = header.map((title, column) =>
        Math.max(title.length, ...groups.flatMap(group => group.rows.map(row => row[column].length))));
    const formatRow = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd();

    const exportedOn = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const lines = [
        'StockZ Watch List',
        `Exported ${exportedOn} - ${plural(selectedItems(items, selectedTickers).length, 'stock')}`,
        '',
        'Prices are from your last watch list refresh. Good Buy and Bad Buy are',
        'the bottom and top of the suggested buy range.',
    ];
    groups.forEach((group) => {
        const title = `${group.name} (${plural(group.rows.length, 'stock')})`;
        lines.push('', '', title, '='.repeat(title.length), formatRow(header));
        group.rows.forEach(row => lines.push(formatRow(row)));
    });
    return lines.join('\n') + '\n';
}

// e.g. "stockz-watchlist-2026-11-07.json" (local date).
export function exportFileName(extension, now = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `stockz-watchlist-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${extension}`;
}
