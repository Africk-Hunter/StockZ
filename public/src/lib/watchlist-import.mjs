/* Pure reader for the importable export file (see watchlist-export.mjs). No
   DOM, no storage. Accepts the JSON text and returns the tickers to add plus
   which watchlist names each ticker belongs to. */
import { sanitizeTicker } from './ticker.mjs';
import { EXPORT_FORMAT_ID, EXPORT_FORMAT_VERSION } from './watchlist-export.mjs';

// True when the text looks like an attempted JSON file (vs. a plain ticker list).
export function looksLikeJson(text) {
    return /^\s*[{[]/.test(text);
}

// Returns { ok: true, tickers, watchlists, tickerFolders, invalid } or
// { ok: false, error }.
//  - tickers:       unique valid tickers, in file order (stocks, then any only listed in a watchlist)
//  - watchlists:    [{ name, tickers }] with sanitized/deduped tickers; blank names dropped
//  - tickerFolders: Map ticker -> [watchlist names]
//  - invalid:       ticker strings that weren't valid symbols
export function parseImportFile(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return { ok: false, error: "That isn't valid JSON. If you pasted part of a file, paste the whole thing or pick the file instead." };
    }
    if (!data || typeof data !== 'object' || data.format !== EXPORT_FORMAT_ID) {
        return { ok: false, error: `Not a StockZ export file (expected format "${EXPORT_FORMAT_ID}").` };
    }
    if (typeof data.version !== 'number' || data.version > EXPORT_FORMAT_VERSION) {
        return { ok: false, error: `This file is from a newer version of StockZ (version ${data.version}) and can't be imported here.` };
    }

    const invalid = [];
    const tickers = [];
    const seen = new Set();
    const take = (raw) => {
        const ticker = sanitizeTicker(raw);
        if (!ticker) {
            if (!invalid.includes(String(raw))) invalid.push(String(raw));
            return null;
        }
        if (!seen.has(ticker)) {
            seen.add(ticker);
            tickers.push(ticker);
        }
        return ticker;
    };

    (Array.isArray(data.stocks) ? data.stocks : []).forEach(stock => take(stock?.ticker));

    const tickerFolders = new Map();
    const watchlists = [];
    (Array.isArray(data.watchlists) ? data.watchlists : []).forEach((list) => {
        const name = typeof list?.name === 'string' ? list.name.trim() : '';
        if (!name) return;
        const listTickers = [];
        (Array.isArray(list.tickers) ? list.tickers : []).forEach((raw) => {
            const ticker = take(raw);
            if (!ticker || listTickers.includes(ticker)) return;
            listTickers.push(ticker);
            const names = tickerFolders.get(ticker) || [];
            if (!names.includes(name)) names.push(name);
            tickerFolders.set(ticker, names);
        });
        watchlists.push({ name, tickers: listTickers });
    });

    if (tickers.length === 0) {
        return { ok: false, error: 'The file has no valid tickers.' };
    }
    return { ok: true, tickers, watchlists, tickerFolders, invalid };
}
