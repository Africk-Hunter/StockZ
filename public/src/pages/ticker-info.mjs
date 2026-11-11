/* Ticker Info page (tickerInfo.html, also served at /WFC etc.): buy ranges,
   chart, dividend/company panels and the Add To Watchlist button. Inputs come
   from the localStorage caches written before navigating here. */
import { auth } from '../lib/firebase.mjs';
import { sanitizeTicker } from '../lib/ticker.mjs';
import { formatMarketCap } from '../lib/format.mjs';
import { getCachedWatchList, getStorageItem } from '../lib/storage.mjs';
import { onWatchlistChanged } from '../lib/events.mjs';
import { getBuyTierLabel, getCurrentPriceRangeColorClass } from '../lib/watchlist-logic.mjs';
import {
    getStockData, fetchStockInfo, fetchDividendInfo, fetchCompanyProfile, runStockCalculations
} from '../lib/stock-service.mjs';
import { openFolderModal } from './folders.mjs';
import { createStockChart } from './chart.mjs';
import { computeBuyRanges, computeBoundsBySkip } from '../lib/buy-range.mjs';

const tickerLabelIP         = document.getElementById("tickerLabelIP");
const stockStatsLink        = document.getElementById("stockStatsLink");
const stockDescLink         = document.getElementById("stockDescLink");
const dividendHistoryLink   = document.getElementById("dividendHistoryLink");
const epsChartLink          = document.getElementById("epsChartLink");
const dividendYieldEl       = document.getElementById("dividendYield");
const payoutRatioEl         = document.getElementById("payoutRatio");
const lastPayoutAmountEl    = document.getElementById("lastPayoutAmount");
const marketCapEl           = document.getElementById("marketCapValue");
const capCategoryEl         = document.getElementById("capCategory");
const sectorEl              = document.getElementById("sectorValue");
const addToWatchlist        = document.getElementById("addToWatchlist");
const grBLonPage            = document.getElementById("grBL");
const bBHonPage             = document.getElementById("bBH");
const thresHoldWarning      = document.getElementById("thresHoldWarning");

export const tickerInfoPageExists = !!tickerLabelIP;

// Called by the entry module once a signed-in user is confirmed, so no data is
// fetched or rendered for signed-out visitors.
export function startTickerInfoPage() {
    if (tickerLabelIP) initTickerInfoPage();
}

if (addToWatchlist) {
    onWatchlistChanged(({ inWatchlist }) => {
        if (typeof inWatchlist === 'boolean') setAddToWatchlistButtonState(inWatchlist);
    });
}

// The ticker in the current URL ("/WFC" → "WFC"), or null on /tickerInfo etc.
function getTickerFromPath() {
    let segment = '';
    try {
        segment = decodeURIComponent(window.location.pathname.replace(/^\/+|\/+$/g, ''));
    } catch (error) {
        return null;
    }
    if (/^tickerInfo(\.html)?$/i.test(segment)) return null;
    return sanitizeTicker(segment);
}

function initTickerInfoPage() {
    // Opened via /WFC (e.g. a middle-click from the watchlist) with nothing cached
    // for that ticker: fetch and calculate it, then reload so the normal page
    // setup runs against the fresh cache.
    let tickerFromPath = getTickerFromPath();
    if (tickerFromPath) {
        let cachedTicker = null;
        try {
            cachedTicker = JSON.parse(getStorageItem('mostRecentCalculations') || 'null')?.ticker ?? null;
        } catch (error) { /* treat as uncached */ }
        if (cachedTicker === tickerFromPath) {
            tickerFromPath = null; // already loaded, render normally
        } else {
            const pathTicker = tickerFromPath;
            getStockData(pathTicker, 'mostRecentData').then(data => {
                runStockCalculations(data.prices, pathTicker, 'mostRecentCalculations');
                window.location.reload();
            }).catch(error => {
                console.error('Error occurred when retrieving stock data: ', error);
                window.location.href = '/main';
            });
        }
    }

    if (!tickerFromPath) {
        renderTickerInfoPage();
    }
}

function renderTickerInfoPage() {
    loadCalculatedValues();
    let ticker = "";
    const storageItem = getStorageItem('mostRecentCalculations');
    if (storageItem) {
        try {
            const calculations = JSON.parse(storageItem);
            ticker = calculations.ticker;
        } catch (error) {
            console.error('Error parsing cached calculations: ', error);
        }
    } else {
        console.log("No calculations found in localStorage.");
    }

    setAddToWatchlistButtonState(isTickerInWatchlist(ticker));

    // "Look past the last N months": recompute the bands from the cached
    // history while ignoring the newest closes, so a dip happening right now
    // doesn't become the reference dip. Only affects this page view.
    const skipSelect = document.getElementById('skipRecentMonths');
    if (skipSelect) {
        skipSelect.addEventListener('change', () => {
            try {
                const data = JSON.parse(getStorageItem('mostRecentData') || 'null');
                if (!data || !Array.isArray(data.prices) || !ticker) return;
                runStockCalculations(data.prices, ticker, 'mostRecentCalculations',
                    { skipRecentMonths: parseInt(skipSelect.value, 10) || 0 });
                loadCalculatedValues();
            } catch (error) {
                console.error('Error recalculating buy ranges: ', error);
            }
        });
    }

    const recentData = getStorageItem('mostRecentData');
    try {
        if (recentData) {
            const data = JSON.parse(recentData);
            createStockChart(data);
        } else {
            console.log("No data was found in localStorage.");
        }
    } catch (error) {
        console.log("Error occurred when loading data.");
    }

    stockStatsLink.addEventListener('click', function() {
        window.open('https://finance.yahoo.com/quote/' + ticker + '/', '_blank');
    });
    stockDescLink.addEventListener('click', function() {
        window.open('https://finance.yahoo.com/quote/' + ticker + '/profile', '_blank');
    });
    dividendHistoryLink.addEventListener('click', function() {
        window.open('https://www.streetinsider.com/dividend_history.php?q=' + ticker, '_blank');
    });
    epsChartLink.addEventListener('click', function() {
        window.open('https://www.zacks.com/stock/chart/' + ticker + '/eps', '_blank');
    });

    if (ticker) {
        loadDividendInfo(ticker);
        loadCompanyProfile(ticker);
    }
    tickerLabelIP.addEventListener('click', function() {
        document.getElementById('buyHolder').style.display = 'none';
        document.getElementById('extraInfo').style.display = 'none';
        document.getElementById('otherButtons').style.display = 'none';
        thresHoldWarning.style.display = 'none';
        tickerLabelIP.textContent = "";
        tickerLabelIP.classList.add("moveDownBox");
        setTimeout(() => {
            window.location.href = ('/main');
        }, 500);
    });
    addToWatchlist.addEventListener('click', async function() {
        const user = auth.currentUser;
        if (!user) {
            console.error("No user is signed in.");
            return;
        }
        const tickerToAdd = sanitizeTicker(ticker);
        if (!tickerToAdd) {
            console.error('Refusing to add an invalid ticker to the watchlist:', ticker);
            return;
        }

        if (isTickerInWatchlist(tickerToAdd)) {
            openFolderModal(tickerToAdd);
            return;
        }

        // Nothing is written to Firestore yet — the user picks which
        // watchlist(s) first, and the folder modal does the actual write when
        // "Add" is clicked. Kick the stock-info fetch off now (in the
        // background) so it's likely already resolved by the time they click
        // Add, instead of blocking on it here.
        let lifetimeStartPrice = null;
        try {
            lifetimeStartPrice = JSON.parse(getStorageItem('mostRecentCalculations'))?.lifetimeStartPrice ?? null;
        } catch (e) { /* no cached calculations: the next refresh fills it in */ }
        // The watchlist stores the default (not "looked past") bounds plus the
        // per-skip ones, so recompute them from the cached history instead of
        // reading whatever the page is currently showing.
        let goodBuyPrice = grBLonPage.textContent.replace('$', '');
        let badBuyPrice = bBHonPage.textContent.replace('$', '');
        let bandsBySkip = null;
        try {
            const history = JSON.parse(getStorageItem('mostRecentData') || 'null');
            if (history && Array.isArray(history.prices) && history.prices.length) {
                const { calculations } = computeBuyRanges(history.prices, tickerToAdd);
                goodBuyPrice = calculations.greatBRLow.toFixed(2);
                badBuyPrice = calculations.badBRHigh.toFixed(2);
                bandsBySkip = computeBoundsBySkip(history.prices, tickerToAdd);
            }
        } catch (e) { /* keep the displayed values; bounds are filled in on demand later */ }
        openFolderModal(tickerToAdd, {
            lifetimeStartPrice,
            goodBuyPrice,
            badBuyPrice,
            bandsBySkip,
            infoPromise: fetchStockInfo(tickerToAdd).catch((error) => {
                console.error('Error fetching stock info: ', error);
                return {};
            })
        });
    });
}

function isTickerInWatchlist(ticker) {
    return getCachedWatchList().some(item => item.ticker === ticker);
}

function setAddToWatchlistButtonState(inWatchlist) {
    if (!addToWatchlist) return;
    addToWatchlist.textContent = inWatchlist ? 'Modify Watchlist(s)' : 'Add To Watchlist';
    // One button style: amber to add, a canopy chip once it is on a list.
    addToWatchlist.classList.toggle('btn', !inWatchlist);
    addToWatchlist.classList.toggle('chip', inWatchlist);
}

function loadCalculatedValues() {
    const storageItem = getStorageItem('mostRecentCalculations');
    try {
        if (storageItem) {
            const calculations = JSON.parse(storageItem);

            tickerLabelIP.textContent = calculations.ticker;
            assignValueOnScreen('grBL', calculations.greatBRLow);
            assignValueOnScreen('grBH', calculations.greatBRHigh);
            assignValueOnScreen('gBL', calculations.goodBRLow);
            assignValueOnScreen('gBH', calculations.goodBRHigh);
            assignValueOnScreen('oBL', calculations.okayBRLow);
            assignValueOnScreen('oBH', calculations.okayBRHigh);
            assignValueOnScreen('bBL', calculations.badBRLow);
            assignValueOnScreen('bBH', calculations.badBRHigh);
            assignValueOnScreen('dipPrice', calculations.dipPrice);
            assignValueOnScreen('currentPrice', calculations.currentPrice);
            assignMobileVerdict(calculations);
            assignCurrentPriceTile(calculations);
            assignRangeOnScreen('mobileGreatRange', calculations.greatBRLow, calculations.greatBRHigh);
            assignRangeOnScreen('mobileGoodRange', calculations.goodBRLow, calculations.goodBRHigh);
            assignRangeOnScreen('mobileOkayRange', calculations.okayBRLow, calculations.okayBRHigh);
            assignRangeOnScreen('mobileBadRange', calculations.badBRLow, calculations.badBRHigh);

        } else {
            console.log("No calculations found in localStorage.");
        }
    } catch (error) {
        console.log("Error occurred when loading data onto page.", error);
    }
    activeWarningOnScreen();
}

function activeWarningOnScreen(){
    const warning = getStorageItem('recentlyCalculatedWarning');
    let data = null;
    try {
        data = warning ? JSON.parse(warning) : null;
    } catch (error) {
        console.error('Error parsing warning flag: ', error);
    }
    if (data === 'threshold'){
        thresHoldWarning.style.display = 'flex';
    } else if (data === 'none'){
        thresHoldWarning.style.display = 'none';
    }
}

function showSpinner(...elements) {
    elements.forEach(el => {
        el.innerHTML = '<span class="spinner" role="status" aria-label="Loading"></span>';
    });
}

function loadDividendInfo(ticker) {
    showSpinner(dividendYieldEl, payoutRatioEl, lastPayoutAmountEl);
    const showNoDividendData = () => {
        dividendYieldEl.textContent = "N/A";
        payoutRatioEl.textContent = "N/A";
        lastPayoutAmountEl.textContent = "N/A";
    };
    fetchDividendInfo(ticker).then((response) => {
        dividendYieldEl.textContent = response.dividendYield ?? "N/A";
        payoutRatioEl.textContent = response.payoutRatio ?? "N/A";
        lastPayoutAmountEl.textContent = response.lastPayoutAmount ?? "N/A";
    }).catch(showNoDividendData);
}

function loadCompanyProfile(ticker) {
    showSpinner(marketCapEl, capCategoryEl, sectorEl);
    const showNoProfileData = () => {
        marketCapEl.textContent = "N/A";
        capCategoryEl.textContent = "N/A";
        sectorEl.textContent = "N/A";
    };
    fetchCompanyProfile(ticker).then((response) => {
        marketCapEl.textContent = formatMarketCap(response.marketCap);
        capCategoryEl.textContent = response.capCategory ?? "N/A";
        sectorEl.textContent = response.sector ?? "N/A";
    }).catch(showNoProfileData);
}

function assignValueOnScreen(id, value){
    if (typeof value === 'number' && Number.isFinite(value)) {
        document.getElementById(id).innerHTML = "$" + value.toFixed(2);
    } else {
        console.error(`Value for ${id} is not a finite number:`, value);
        document.getElementById(id).innerHTML = "N/A";
    }
}

// Phone header: the current price in large type plus the verdict as a word
// (and a tier colour), so the answer is readable without comparing numbers.
function assignMobileVerdict(calculations) {
    const priceEl = document.getElementById('mobileCurrentPrice');
    const verdictEl = document.getElementById('mobileVerdict');
    if (!priceEl || !verdictEl) return;
    const price = calculations.currentPrice;
    priceEl.textContent = (typeof price === 'number' && Number.isFinite(price)) ? '$' + price.toFixed(2) : 'N/A';
    const label = getBuyTierLabel(price, calculations.greatBRLow, calculations.badBRHigh);
    const colorClass = getCurrentPriceRangeColorClass(price, calculations.greatBRLow, calculations.badBRHigh);
    verdictEl.textContent = label ? (label === 'Below' ? 'Below range' : label + ' buy') : '—';
    verdictEl.className = verdictEl.className.replace(/\b(bg-\S+|text-cream|text-ink)\b/g, '').trim();
    verdictEl.classList.add(...(colorClass ? colorClass.split(' ') : ['bg-canopy', 'text-cream']));
}

// Desktop price panel: tint the current-price tile with its buy-range colour
// matching the band the price falls in. The colour is the signal; the tier
// name is only a hover tooltip.
function assignCurrentPriceTile(calculations) {
    const tileEl = document.getElementById('currentPriceTile');
    if (!tileEl) return;
    const { currentPrice, greatBRLow, badBRHigh } = calculations;
    const label = getBuyTierLabel(currentPrice, greatBRLow, badBRHigh);
    const colorClass = getCurrentPriceRangeColorClass(currentPrice, greatBRLow, badBRHigh);
    tileEl.title = label ? (label === 'Below' ? 'Below range' : label + ' buy') : '';
    tileEl.className = tileEl.className.replace(/\b(bg-\S+|text-cream|text-ink)\b/g, '').trim();
    tileEl.classList.add(...(colorClass ? colorClass.split(' ') : ['bg-canopy', 'text-cream']));
    // On a tinted tile the captions take the tile's own text colour (ink or
    // cream, whichever the tier picked) instead of the fixed sand.
    tileEl.classList.toggle('is-tinted', Boolean(colorClass));
}

// Mobile buy-range rows show a single "$low–$high" string per zone instead
// of the desktop table's separate low/high cells.
function assignRangeOnScreen(id, low, high) {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof low === 'number' && Number.isFinite(low) && typeof high === 'number' && Number.isFinite(high)) {
        el.textContent = `$${low.toFixed(2)}–$${high.toFixed(2)}`;
    } else {
        el.textContent = "N/A";
    }
}
