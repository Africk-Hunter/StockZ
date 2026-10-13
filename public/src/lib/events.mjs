/* The watchlist changed (item added/removed, folder membership edited, folder
   selected). Lets the folder modal/dropdown notify whichever page pieces are
   present — the watchlist table, the Ticker Info "Add To Watchlist" button —
   without importing them. `detail.inWatchlist` is true/false when a ticker was
   added/removed, and absent otherwise. */
const EVENT_NAME = 'watchlist:changed';

export function notifyWatchlistChanged(detail = {}) {
    document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

export function onWatchlistChanged(handler) {
    document.addEventListener(EVENT_NAME, (event) => handler(event.detail));
}
