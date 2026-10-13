/* Typed access to the localStorage caches that carry data between pages.
   Keys: userWatchListData, userWatchlistFolders (per-user Firestore mirrors),
   mostRecentData / mostRecentCalculations (the ticker page's inputs) and
   recentlyCalculatedWarning (see stock-service.mjs). */

function readJsonList(key, label) {
    const raw = localStorage.getItem(key);
    try {
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.error(`Error parsing cached ${label}: `, error);
        return [];
    }
}

export function getCachedWatchList() {
    return readJsonList('userWatchListData', 'watchlist');
}

export function setCachedWatchList(items) {
    localStorage.setItem('userWatchListData', JSON.stringify(items));
}

export function getCachedFolders() {
    return readJsonList('userWatchlistFolders', 'watchlist folders');
}

export function setCachedFolders(folders) {
    localStorage.setItem('userWatchlistFolders', JSON.stringify(folders));
}
