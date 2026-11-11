/* Watch List page: sort controls, refresh button, and (re)rendering the table. */
import { auth } from '../lib/firebase.mjs';
import { getCachedWatchList, setCachedFolders, getStorageItem, setStorageItem } from '../lib/storage.mjs';
import { fetchWatchlistFolders } from '../lib/watchlist-repo.mjs';
import { sortWatchlistItems, withSkippedBands } from '../lib/watchlist-logic.mjs';
import { SKIP_MONTH_OPTIONS } from '../lib/buy-range.mjs';
import { onWatchlistChanged } from '../lib/events.mjs';
import { watchlistState } from './watchlist-state.mjs';
import { updateWatchlistUI } from './watchlist-rows.mjs';
import { initWatchlistFolders, renderFolderDropdown } from './folders.mjs';
import { updateWatchListValues, showRefreshStatus, clearStuckRefreshProgress, ensureSkipBounds } from './watchlist-refresh.mjs';

export const watchlistItemsContainer = document.getElementById("watchlistItemsContainer");
const refreshButton           = document.getElementById("refreshButton");
const sortByNameBtn           = document.getElementById("sortByName");
const sortByPriceBtn          = document.getElementById("sortByPrice");
const sortByGBBtn             = document.getElementById("sortByGB");
const sortByBBBtn             = document.getElementById("sortByBB");
const sortByDividendBtn       = document.getElementById("sortByDividend");
const sortByNameArrow         = document.getElementById("sortByNameArrow");
const sortByPriceArrow        = document.getElementById("sortByPriceArrow");
const sortByGBArrow           = document.getElementById("sortByGBArrow");
const sortByBBArrow           = document.getElementById("sortByBBArrow");
const sortByDividendArrow     = document.getElementById("sortByDividendArrow");

// Called once a user is signed in on the watchlist page.
export function startWatchlistPage(user) {
    initWatchlistFolders(user);
    runWatchlist();
}

if (watchlistItemsContainer) {
    onWatchlistChanged(() => runWatchlist());

    refreshButton.addEventListener('click', async function(){
        if (refreshButton.disabled) return;
        const user = auth.currentUser;
        if (user) {
            const refreshIcon = refreshButton.querySelector('svg');
            refreshButton.disabled = true;
            refreshIcon.classList.add('animate-spin');
            try {
                const [result, folders] = await Promise.all([
                    updateWatchListValues(user),
                    fetchWatchlistFolders(user.uid)
                ]);
                setCachedFolders(folders);
                renderFolderDropdown(folders);
                showRefreshStatus(result.failed);
            } finally {
                clearStuckRefreshProgress();
                refreshIcon.classList.remove('animate-spin');
                refreshButton.disabled = false;
            }
        } else {
            console.error("No user is signed in.");
        }
    });

    // "Look past the last N months": a device-level view setting. Switching it
    // repaints instantly from the per-skip bounds each item already stores;
    // only items that lack them are fetched (one request each, not a refresh).
    const skipSelect = document.getElementById('skipRecentMonths');
    if (skipSelect) {
        const saved = parseInt(getStorageItem('watchlistSkipMonths'), 10);
        watchlistState.skipMonths = SKIP_MONTH_OPTIONS.includes(saved) ? saved : 0;
        skipSelect.value = String(watchlistState.skipMonths);
        skipSelect.addEventListener('change', async () => {
            const months = parseInt(skipSelect.value, 10) || 0;
            watchlistState.skipMonths = months;
            setStorageItem('watchlistSkipMonths', String(months));
            runWatchlist();
            const user = auth.currentUser;
            if (months && user) {
                try {
                    await ensureSkipBounds(user, months);
                } finally {
                    clearStuckRefreshProgress();
                }
                // Rows repainted as they filled in; re-sort once at the end.
                if (watchlistState.skipMonths === months) runWatchlist();
            }
        });
    }

    sortByNameBtn.addEventListener('click', () => sortWatchlist('ticker'));
    sortByPriceBtn.addEventListener('click', () => sortWatchlist('currentPrice'));
    sortByGBBtn.addEventListener('click', () => sortWatchlist('goodBuyPrice'));
    sortByBBBtn.addEventListener('click', () => sortWatchlist('badBuyPrice'));
    sortByDividendBtn.addEventListener('click', () => sortWatchlist('dividendYield'));

    const mobileSortSelect = document.getElementById('mobileSortSelect');
    const mobileSortDir = document.getElementById('mobileSortDir');
    mobileSortSelect.addEventListener('change', () => {
        watchlistState.sortKey = mobileSortSelect.value || null;
        watchlistState.sortDirection = watchlistState.sortKey === 'currentPrice' ? 'desc' : 'asc';
        runWatchlist();
    });
    mobileSortDir.addEventListener('click', () => {
        if (!watchlistState.sortKey) {
            // No sort chosen yet: start sorting by name, descending
            watchlistState.sortKey = 'ticker';
            watchlistState.sortDirection = 'desc';
        } else {
            watchlistState.sortDirection = watchlistState.sortDirection === 'asc' ? 'desc' : 'asc';
        }
        runWatchlist();
    });
}

function runWatchlist() {
    const parsedWatchList = getCachedWatchList();
    const { currentFolderId, sortKey, sortDirection } = watchlistState;

    const inFolder = currentFolderId
        ? parsedWatchList.filter(item => Array.isArray(item.folderIds) && item.folderIds.includes(currentFolderId))
        : parsedWatchList;
    // Sort on the bounds the table is showing (the "look past" ones, if on).
    const visibleWatchList = inFolder.map(item => withSkippedBands(item, watchlistState.skipMonths));

    sortWatchlistItems(visibleWatchList, sortKey, sortDirection);

    updateWatchlistUI(visibleWatchList);
    updateSortIndicators();
}

function sortWatchlist(key) {
    if (key === 'currentPrice') {
        // Price column cycles: price high -> low, price low -> high, buy tier (best first)
        if (watchlistState.sortKey === 'currentPrice' && watchlistState.sortDirection === 'desc') {
            watchlistState.sortDirection = 'asc';
        } else if (watchlistState.sortKey === 'currentPrice') {
            watchlistState.sortKey = 'priceTier';
            watchlistState.sortDirection = 'asc';
        } else {
            watchlistState.sortKey = 'currentPrice';
            watchlistState.sortDirection = 'desc';
        }
    } else if (watchlistState.sortKey === key) {
        watchlistState.sortDirection = watchlistState.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        watchlistState.sortKey = key;
        watchlistState.sortDirection = 'asc';
    }
    runWatchlist();
}

function updateSortIndicators() {
    const { sortKey, sortDirection } = watchlistState;
    const arrowByKey = {
        ticker: sortByNameArrow,
        currentPrice: sortByPriceArrow,
        goodBuyPrice: sortByGBArrow,
        badBuyPrice: sortByBBArrow,
        dividendYield: sortByDividendArrow
    };

    Object.entries(arrowByKey).forEach(([key, el]) => {
        if (!el) return;
        const arrow = sortDirection === 'asc' ? '▲' : '▼';
        if (key === 'currentPrice' && sortKey === 'priceTier') {
            el.textContent = '★';
        } else {
            el.textContent = key === sortKey ? arrow : '';
        }
    });

    const mobileSortSelect = document.getElementById('mobileSortSelect');
    const mobileSortDir = document.getElementById('mobileSortDir');
    if (mobileSortSelect) mobileSortSelect.value = sortKey || '';
    if (mobileSortDir) mobileSortDir.querySelector('svg').style.transform = sortDirection === 'asc' ? '' : 'rotate(180deg)';
}
