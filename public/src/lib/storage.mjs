/* Typed access to the localStorage caches that carry data between pages.
   Keys: userWatchListData, userWatchlistFolders (per-user Firestore mirrors),
   mostRecentData / mostRecentCalculations (the ticker page's inputs) and
   recentlyCalculatedWarning (see stock-service.mjs). */

export function storageAvailable() {
    try {
        const key = '__stockz_storage_probe__';
        window.localStorage.setItem(key, '1');
        window.localStorage.removeItem(key);
        return true;
    } catch (error) {
        return false;
    }
}

export function getStorageItem(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (error) {
        return null;
    }
}

export function setStorageItem(key, value) {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch (error) {
        return false;
    }
}

export function readJsonList(key, label) {
    const raw = getStorageItem(key);
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
    setStorageItem('userWatchListData', JSON.stringify(items));
}

export function getCachedFolders() {
    return readJsonList('userWatchlistFolders', 'watchlist folders');
}

export function setCachedFolders(folders) {
    setStorageItem('userWatchlistFolders', JSON.stringify(folders));
}
