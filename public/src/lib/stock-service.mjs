/* Client side of the Netlify functions plus the calculation cache. */
import { computeBuyRanges } from './buy-range.mjs';
import { tickerPath } from './ticker.mjs';

// GETs `url` as JSON via XHR with a 15s timeout. `noun` ("stock data", ...)
// only shapes the error messages. Rejected errors carry `.status` for HTTP
// failures so callers can special-case e.g. 429.
function getJson(url, ticker, noun, onSuccess) {
    return new Promise((resolve, reject) => {
        var xhttp = new XMLHttpRequest();
        xhttp.timeout = 15000;
        xhttp.ontimeout = function() {
            reject(new Error(`Timed out fetching ${noun} for ${ticker}`));
        };
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4) {
                if (this.status == 200) {
                    try {
                        var response = JSON.parse(this.responseText);
                        if (onSuccess) onSuccess(response);
                        resolve(response);
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    const failure = new Error(`Failed to fetch ${noun} for ${ticker} (status ${this.status})`);
                    failure.status = this.status;
                    reject(failure);
                }
            }
        };
        xhttp.open("GET", url + encodeURIComponent(ticker), true);
        xhttp.send();
    });
}

// Resolves `{ prices, dates }` (most recent first). `localStorageItem` is
// optional: pass it when the result should also be cached for the next page.
export function getStockData(ticker, localStorageItem) {
    return getJson("/run-calculations?ticker=", ticker, 'stock data', (response) => {
        if (localStorageItem) localStorage.setItem(localStorageItem, JSON.stringify(response));
    });
}

export function fetchStockInfo(ticker) {
    return getJson("/stock-info?ticker=", ticker, 'stock info');
}

export function setThresholdWarning(thresholdLowered) {
    localStorage.setItem('recentlyCalculatedWarning', JSON.stringify(thresholdLowered ? 'threshold' : 'none'));
}

// `localStorageItem` is optional — pass it when the result also needs to be
// cached for the next page load (e.g. before navigating to /tickerInfo);
// omit it for bulk/concurrent callers (like a watchlist refresh) so they
// don't all fight over the same shared localStorage key. Either way, the
// calculations are always returned directly.
export function runStockCalculations(rawData, ticker, localStorageItem) {
    const { calculations, thresholdLowered } = computeBuyRanges(rawData, ticker);
    setThresholdWarning(thresholdLowered);

    if (localStorageItem) {
        localStorage.setItem(localStorageItem, JSON.stringify(calculations));
    }

    return calculations;
}

// Bumped by each main-page ticker submission so a slower, older request can
// tell it was superseded.
let latestTickerRequestId = 0;
export function nextTickerRequestId() {
    return ++latestTickerRequestId;
}

// Shared by the main ticker search and every "open this ticker" click in the
// watchlist: fetch → calculate → cache → navigate to the ticker-info page.
// `requestId`, when passed (from nextTickerRequestId), guards against a
// slower, older request finishing after (and clobbering) a newer one.
export async function loadTickerAndNavigate(ticker, requestId) {
    const data = await getStockData(ticker, 'mostRecentData');
    if (requestId !== undefined && requestId !== latestTickerRequestId) {
        return; // superseded by a newer submission — drop this result
    }
    runStockCalculations(data.prices, ticker, 'mostRecentCalculations');
    window.location.href = tickerPath(ticker);
}

// "Open this ticker" for click handlers: loads it and navigates, logging (not
// throwing) on failure.
export function navigateToTicker(ticker) {
    return loadTickerAndNavigate(ticker).catch(error => {
        console.error('Error occurred when retrieving stock data: ', error);
    });
}

export function isLatestTickerRequest(requestId) {
    return requestId === latestTickerRequestId;
}

export function fetchDividendInfo(ticker) {
    return getJson("/run-dividend-info?ticker=", ticker, 'dividend info');
}

export function fetchCompanyProfile(ticker) {
    return getJson("/company-profile?ticker=", ticker, 'company profile');
}
