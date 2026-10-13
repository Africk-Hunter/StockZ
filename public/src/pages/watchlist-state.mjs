// View state for the watchlist page, shared by the table, the sort controls
// and the folder dropdown. (Cached data lives in lib/storage.mjs.)
export const watchlistState = {
    currentFolderId: null,        // null = "All Stocks"
    sortKey: 'priceTier',         // null = Firestore order
    sortDirection: 'asc',
};
