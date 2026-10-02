import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { getFirestore, collection, setDoc, getDocs, doc, deleteDoc, updateDoc, writeBatch, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

const firebaseConfig = {
  apiKey: "AIzaSyAuxROpJhqJ4-fgIC4xwNYV5ycd0O_QCO4",
  authDomain: "stockz-1d5ca.firebaseapp.com",
  projectId: "stockz-1d5ca",
  storageBucket: "stockz-1d5ca.appspot.com",
  messagingSenderId: "853457963776",
  appId: "1:853457963776:web:0cae1e3883c0195f6681e5",
  measurementId: "G-80DCFJFT65"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* Dip-finding tuning constants (previously unnamed literals) */
const DIP_SCORE_DECAY_PER_MONTH = 0.01;
const INITIAL_DIP_THRESHOLD     = 0.10;
const DIP_THRESHOLD_STEP        = 0.03;

/* Ticker validation: only accept things that actually look like ticker
   symbols before they're used as a Firestore document ID or forwarded to a
   backend function. */
const TICKER_PATTERN = /^[A-Z.\-]{1,10}$/;
function sanitizeTicker(raw) {
    const upper = String(raw ?? '').trim().toUpperCase();
    return TICKER_PATTERN.test(upper) ? upper : null;
}

/* ------------------------------------------------------------------ *
 * Error logging & bug reports.
 *
 * There's no backend/database for this static site, so error reports are
 * POSTed to the /log-error function, which just writes them to Netlify's
 * function logs — that's the only "delivery" needed. Errors are also kept
 * in a capped localStorage ring buffer so a user-submitted report can
 * include what happened earlier in the session, not just the error at
 * report time. console.error is wrapped (instead of editing every call
 * site) so every existing and future console.error call is captured for
 * free, on top of truly uncaught exceptions and unhandled rejections.
 * ------------------------------------------------------------------ */
const ERROR_LOG_KEY = 'stockZ_errorLog';
const ERROR_LOG_MAX_ENTRIES = 25;

function readErrorLog() {
    try {
        const parsed = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function recordError(level, message, extra = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message: String(message).slice(0, 2000),
        page: location.pathname,
        ...extra,
    };

    const log = readErrorLog();
    log.push(entry);
    while (log.length > ERROR_LOG_MAX_ENTRIES) log.shift();
    try {
        localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(log));
    } catch (error) {
        // localStorage full/unavailable — nothing more to do locally.
    }

    sendErrorReport(entry);
}

function sendErrorReport(entry) {
    try {
        const payload = JSON.stringify({ ...entry, userAgent: navigator.userAgent });
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/log-error', new Blob([payload], { type: 'application/json' }));
        } else {
            fetch('/log-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
        }
    } catch (error) {
        // Reporting must never itself throw or block the app.
    }
}

const nativeConsoleError = console.error.bind(console);
console.error = function (...args) {
    nativeConsoleError(...args);
    try {
        const message = args.map((arg) => {
            if (arg instanceof Error) return arg.stack || arg.message;
            if (typeof arg === 'string') return arg;
            try { return JSON.stringify(arg); } catch { return String(arg); }
        }).join(' ');
        recordError('console.error', message);
    } catch (error) {
        // Never let logging itself break the app.
    }
};

window.addEventListener('error', function (event) {
    recordError('uncaught-exception', event.message, {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error && event.error.stack ? String(event.error.stack).slice(0, 4000) : undefined,
    });
});

window.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason;
    recordError('unhandled-rejection', reason instanceof Error ? reason.message : String(reason), {
        stack: reason instanceof Error && reason.stack ? String(reason.stack).slice(0, 4000) : undefined,
    });
});

// User-facing "Report a Problem" modal, wired up to the nav-bug-report
// button(s) that sit next to the logout button in the navbar. That markup
// only exists on pages a logged-in user reaches (main/tickerInfo/watchlist),
// so the whole feature is naturally absent from the login page instead of
// needing an auth-state check here.
function initBugReportWidget() {
    const triggers = document.querySelectorAll('.nav-bug-report');
    if (triggers.length === 0) return;

    const overlay = document.createElement('div');
    overlay.className = 'hidden modal-overlay';
    overlay.innerHTML = `
        <div class="modal-panel">
            <div class="flex justify-between items-center">
                <h2 class="modal-title">Report a Problem</h2>
                <button type="button" data-bug-report-close class="modal-close">&times;</button>
            </div>
            <p class="text-xs laptop:text-sm text-text-color text-opacity-70">Tell me what happened — recent technical details from your session will be included automatically so I can look into it.</p>
            <textarea data-bug-report-description rows="4" maxlength="1000" placeholder="What were you doing when something went wrong? (optional)" class="input-field resize-none"></textarea>
            <div data-bug-report-status class="text-xs laptop:text-sm hidden"></div>
            <div class="flex justify-end gap-2">
                <button type="button" data-bug-report-cancel class="btn-ghost">Cancel</button>
                <button type="button" data-bug-report-send class="btn-primary">Send Report</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const descriptionEl = overlay.querySelector('[data-bug-report-description]');
    const statusEl = overlay.querySelector('[data-bug-report-status]');
    const sendBtn = overlay.querySelector('[data-bug-report-send]');

    const closeModal = () => {
        overlay.classList.add('hidden');
        descriptionEl.value = '';
        statusEl.classList.add('hidden');
        statusEl.textContent = '';
    };

    triggers.forEach((trigger) => trigger.addEventListener('click', () => overlay.classList.remove('hidden')));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeModal(); });
    overlay.querySelector('[data-bug-report-close]').addEventListener('click', closeModal);
    overlay.querySelector('[data-bug-report-cancel]').addEventListener('click', closeModal);

    sendBtn.addEventListener('click', async () => {
        const description = descriptionEl.value.trim();
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';

        try {
            const response = await fetch('/log-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    level: 'user-report',
                    message: description || '(no description provided)',
                    description,
                    page: location.pathname,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString(),
                    recentErrors: readErrorLog().slice(-10),
                }),
            });
            if (!response.ok) throw new Error(`Report failed with status ${response.status}`);
            statusEl.textContent = 'Thanks — your report was sent.';
            statusEl.className = 'text-xs laptop:text-sm text-accent-color';
            setTimeout(closeModal, 1500);
        } catch (error) {
            statusEl.textContent = "Couldn't send automatically — please email gamehunter5879@gmail.com directly.";
            statusEl.className = 'text-xs laptop:text-sm text-desperate-buy-one';
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Report';
            statusEl.classList.remove('hidden');
        }
    });
}
initBugReportWidget();

let tickerRequestId         = 0;
/* Elements */
var enterButton             = document.getElementById("enterButton");
let inputUsername           = document.getElementById('inputUsername');
let inputPassword           = document.getElementById('inputPassword');
/* Main Page */
const tickerParentBox       = document.getElementById("tickerParentBox");
const mainTickerInput       = document.getElementById("mainTickerInput");
const tickerSubmitBtn       = document.getElementById("tickerSubmitBtn");
/* Ticker Info Page */
let tickerLabelIP           = document.getElementById("tickerLabelIP");
let stockStatsLink          = document.getElementById("stockStatsLink");
let stockDescLink           = document.getElementById("stockDescLink");
let dividendHistoryLink     = document.getElementById("dividendHistoryLink");
let epsChartLink            = document.getElementById("epsChartLink");
let dividendYieldEl         = document.getElementById("dividendYield");
let payoutRatioEl           = document.getElementById("payoutRatio");
let lastPayoutAmountEl      = document.getElementById("lastPayoutAmount");
let marketCapEl             = document.getElementById("marketCapValue");
let capCategoryEl           = document.getElementById("capCategory");
let sectorEl                = document.getElementById("sectorValue");
let addToWatchlist          = document.getElementById("addToWatchlist");
let grBLonPage              = document.getElementById("grBL");
let bBHonPage                = document.getElementById("bBH");
let thresHoldWarning        = document.getElementById("thresHoldWarning");
let chartRangeButtons       = document.getElementById("chartRangeButtons");
/* Watch List Page */
let watchlistItemsContainer = document.getElementById("watchlistItemsContainer");
let refreshButton           = document.getElementById("refreshButton");
let watchListContainerLarge = document.getElementById("watchListContainerLarge");
let sortByNameBtn           = document.getElementById("sortByName");
let sortByPriceBtn          = document.getElementById("sortByPrice");
let sortByGBBtn             = document.getElementById("sortByGB");
let sortByBBBtn             = document.getElementById("sortByBB");
let sortByDividendBtn       = document.getElementById("sortByDividend");
let sortByNameArrow         = document.getElementById("sortByNameArrow");
let sortByPriceArrow        = document.getElementById("sortByPriceArrow");
let sortByGBArrow           = document.getElementById("sortByGBArrow");
let sortByBBArrow           = document.getElementById("sortByBBArrow");
let sortByDividendArrow     = document.getElementById("sortByDividendArrow");
let currentSortKey          = 'priceTier';
let currentSortDirection    = 'asc';
/* Watch List Folders */
let folderDropdownWrapper   = document.getElementById("folderDropdownWrapper");
let folderDropdownBtn       = document.getElementById("folderDropdownBtn");
let folderDropdownLabel     = document.getElementById("folderDropdownLabel");
let folderDropdownPanel     = document.getElementById("folderDropdownPanel");
let folderModalOverlay      = document.getElementById("folderModalOverlay");
let folderModalTitle        = document.getElementById("folderModalTitle");
let folderModalCloseBtn     = document.getElementById("folderModalCloseBtn");
let folderModalList         = document.getElementById("folderModalList");
let folderModalNewFolderForm  = document.getElementById("folderModalNewFolderForm");
let folderModalNewFolderInput = document.getElementById("folderModalNewFolderInput");
let folderModalAddBtn       = document.getElementById("folderModalAddBtn");
let currentFolderId         = null;
let currentModalTicker      = null;
let deleteConfirmModalOverlay    = document.getElementById("deleteConfirmModalOverlay");
let deleteConfirmModalMessage    = document.getElementById("deleteConfirmModalMessage");
let deleteConfirmModalCloseBtn   = document.getElementById("deleteConfirmModalCloseBtn");
let deleteConfirmModalCancelBtn  = document.getElementById("deleteConfirmModalCancelBtn");
let deleteConfirmModalConfirmBtn = document.getElementById("deleteConfirmModalConfirmBtn");
let renameFolderModalOverlay   = document.getElementById("renameFolderModalOverlay");
let renameFolderModalForm      = document.getElementById("renameFolderModalForm");
let renameFolderModalInput     = document.getElementById("renameFolderModalInput");
let renameFolderModalCloseBtn  = document.getElementById("renameFolderModalCloseBtn");
let renameFolderModalCancelBtn = document.getElementById("renameFolderModalCancelBtn");
let renameFolderModalSaveBtn   = document.getElementById("renameFolderModalSaveBtn");
let bulkAddBtn                 = document.getElementById("bulkAddBtn");
let bulkAddModalOverlay        = document.getElementById("bulkAddModalOverlay");
let bulkAddModalForm           = document.getElementById("bulkAddModalForm");
let bulkAddModalInput          = document.getElementById("bulkAddModalInput");
let bulkAddModalStatus         = document.getElementById("bulkAddModalStatus");
let bulkAddModalCloseBtn       = document.getElementById("bulkAddModalCloseBtn");
let bulkAddModalCancelBtn      = document.getElementById("bulkAddModalCancelBtn");
let bulkAddModalSubmitBtn      = document.getElementById("bulkAddModalSubmitBtn");
const BULK_ADD_MAX_TICKERS     = 50;
let bulkAddRunning             = false;
let bulkAddFolders             = document.getElementById("bulkAddModalFolders");
let bulkAddFolderIds           = new Set();
// The folder currently being renamed in the rename modal.
let renamingFolder             = null;
// Holds the callback for whichever delete action is currently pending confirmation.
let pendingDeleteAction     = null;
// Watchlist selections made inside the folder modal are staged here and only
// written to Firestore when folderModalAddBtn is clicked — checking/
// unchecking a box no longer writes immediately.
let pendingFolderIds        = new Set();
// Set by openFolderModal() when the modal is adding a ticker that isn't on
// the watchlist yet (see commitFolderSelection()); null while reorganizing
// an existing item's watchlists.
let pendingNewEntry         = null;
// False once "All" is unchecked on an existing item — saving then removes the
// ticker from the watchlist entirely (after a confirmation).
let pendingKeepInAll        = true;

auth.onAuthStateChanged(async (user) => {
    if (user) {
        if (watchlistItemsContainer) {
            initWatchlistFolders(user);
            runWatchlist(user);
        } else if (enterButton) {
            let userWatchListData = await fetchWatchlistItems(user.uid);
            localStorage.setItem('userWatchListData', JSON.stringify(userWatchListData));
            let userWatchlistFolders = await fetchWatchlistFolders(user.uid);
            localStorage.setItem('userWatchlistFolders', JSON.stringify(userWatchlistFolders));
            window.location.href = '/main';
        }
    }
});

async function loginUser(username, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, username, password);
      return userCredential.user;
    } catch (error) {
      console.error("Error logging in: ", error);

      return null;
    }
  }
  async function handleLogin() {
    const username = inputUsername.value;
    const password = inputPassword.value;

    if (username === "") {
        inputUsername.style.background = "red";
    }
    if (password === "") {
        inputPassword.style.background = "red";
    }
    inputPassword.addEventListener('click', function () {
        inputPassword.style.background = '#E4ECE4';
    });
    inputUsername.addEventListener('click', function () {
        inputUsername.style.background = '#E4ECE4';
    });

    try {
        const user = await loginUser(username, password);
        if (user) {
            document.getElementById("stockZ").classList.add("fadeAway");
            var inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
            inputs.forEach(function (input) {
                input.classList.add("fadeAway");
            });
            enterButton.classList.add("fadeAway");

            let userWatchListData = await fetchWatchlistItems(user.uid);
            localStorage.setItem('userWatchListData', JSON.stringify(userWatchListData));
            let userWatchlistFolders = await fetchWatchlistFolders(user.uid);
            localStorage.setItem('userWatchlistFolders', JSON.stringify(userWatchlistFolders));
            setTimeout(() => {
                window.location.href = '/main';
            }, 200);
        } else {
            inputUsername.style.background = 'red';
            inputPassword.style.background = 'red';
            alert('Incorrect email or password. Please try again.');
        }
    } catch (error) {
        console.error("Error during login or fetching watchlist: ", error);
        alert('Something went wrong signing you in. Please try again.');
    }
}



if (enterButton) {
    enterButton.addEventListener("click", handleLogin);

    inputUsername.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            handleLogin();
        }
    });

    inputPassword.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            handleLogin();
        }
    });
  } else {
    // Each nav destination now has two DOM elements per page (the desktop
    // top nav item and the mobile bottom tab bar item), so wiring is done by
    // shared class instead of a single id.
    document.querySelectorAll('.nav-home').forEach((el) => el.addEventListener('click', navigateTo('/main', 'main.html')));
    document.querySelectorAll('.nav-ticker-info').forEach((el) => el.addEventListener('click', navigateTo('/tickerInfo', 'tickerInfo.html')));
    document.querySelectorAll('.nav-watchlist').forEach((el) => el.addEventListener('click', navigateTo('/watchlist', 'watchlist.html')));
}

// Shared by every nav button above: fade out, then navigate, unless we're
// already on that page.
function navigateTo(url, activePageMarker) {
    return function () {
        if (!document.URL.includes(activePageMarker)) {
            document.querySelector('main').classList.add("fadeAway");
            setTimeout(() => {
                window.location.href = url;
            }, 200);
        }
    };
}

document.querySelectorAll('.nav-logout').forEach((el) => el.addEventListener('click', function() {
    logOutUser();
}));

async function logOutUser(){
    try {
        await signOut(auth);
        document.getElementById('mainWrapper').classList.add('fadeAway');
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      } catch (error) {
        console.error('Error logging out: ', error);
        alert('An error occurred while logging out. Please try again.');
      }
}

if (tickerParentBox) {
    renderMobileSearchSuggestions();
    mainTickerInput.addEventListener('input', function(){
        mainTickerInput.classList.remove('invalid-ticker');
        if(mainTickerInput.value != ""){
            tickerSubmitBtn.style.display = 'flex';
        } else{
            tickerSubmitBtn.style.display = 'none';
        }
        renderMobileSearchSuggestions();
    });
    tickerSubmitBtn.addEventListener('click', function() {
        tickerSubmit();
    });
    mainTickerInput.addEventListener("keypress", function (event) {
        if (event.key === "Enter" && mainTickerInput.value != "") {
            event.preventDefault();
            tickerSubmit();
        }
    });
}

// Mobile-only "search" quick-access list on the Main page. There's no
// ticker/company-name database to fuzzy-search against, so this filters the
// user's own cached watchlist instead — an empty query shows the whole
// watchlist, a query narrows it, and the existing ticker-entry flow above
// still works for any symbol not already on the watchlist.
function renderMobileSearchSuggestions() {
    const container = document.getElementById('mobileSearchResultsContainer');
    const label = document.getElementById('mobileSearchResultsLabel');
    if (!container || !label) return;

    const query = mainTickerInput.value.trim().toLowerCase();
    const watchlist = getCachedWatchList();
    const results = query
        ? watchlist.filter(item =>
            item.ticker.toLowerCase().includes(query) ||
            (item.name && item.name.toLowerCase().includes(query)))
        : watchlist;

    label.textContent = query ? 'Results' : 'Your Watchlist';
    container.innerHTML = '';
    results.forEach((item) => {
        container.appendChild(createSearchResultRow(item));
    });
}

function createSearchResultRow(item) {
    const row = document.createElement('div');
    row.className = 'card flex items-center justify-between gap-3 px-4 py-3 hover:cursor-pointer transition duration-150 hover:bg-opacity-30 hover:border-opacity-50';

    const left = document.createElement('div');
    left.className = 'flex flex-col gap-0.5 min-w-0';
    const symbolEl = document.createElement('div');
    symbolEl.className = 'text-text-color font-bold text-sm';
    symbolEl.textContent = item.ticker;
    const nameEl = document.createElement('div');
    nameEl.className = 'text-text-color text-opacity-60 text-xs truncate';
    nameEl.textContent = item.name || '';
    left.appendChild(symbolEl);
    left.appendChild(nameEl);

    const priceEl = document.createElement('div');
    priceEl.className = 'font-poppins font-bold text-text-color text-sm flex-shrink-0';
    priceEl.textContent = item.currentPrice != null ? `$${Number(item.currentPrice).toFixed(2)}` : '—';

    row.appendChild(left);
    row.appendChild(priceEl);

    row.addEventListener('click', function () {
        document.querySelector('main').classList.add('fadeAway');
        loadTickerAndNavigate(item.ticker).catch(error => {
            console.error('Error occurred when retrieving stock data: ', error);
        });
    });

    return row;
}

function tickerSubmit(){
    const ticker = sanitizeTicker(mainTickerInput.value);
    if (!ticker) {
        mainTickerInput.classList.add('invalid-ticker');
        return;
    }
    tickerSubmitBtn.style.display = 'none';
    mainTickerInput.classList.add("sizeText");
    tickerParentBox.classList.add("moveUpBox");

    const requestId = ++tickerRequestId;
    loadTickerAndNavigate(ticker, requestId).catch(error => {
        console.error('Error occurred when retrieving stock data: ', error);
        if (requestId === tickerRequestId) {
            tickerSubmitBtn.style.display = 'flex';
            mainTickerInput.classList.remove("sizeText");
            tickerParentBox.classList.remove("moveUpBox");
            mainTickerInput.classList.add('invalid-ticker');
        }
    });
}

// Shared by the main ticker search and every "open this ticker" click in the
// watchlist: fetch → calculate → cache → navigate to the ticker-info page.
// `requestId`, when passed, guards against a slower, older request finishing
// after (and clobbering the results of) a newer one.
async function loadTickerAndNavigate(ticker, requestId) {
    const data = await getStockData(ticker, 'mostRecentData');
    if (requestId !== undefined && requestId !== tickerRequestId) {
        return; // superseded by a newer submission — drop this result
    }
    runStockCalculations(data.prices, ticker, 'mostRecentCalculations');
    window.location.href = tickerPath(ticker);
}

// Shareable per-ticker URL, e.g. /WFC (rewritten to tickerInfo.html in netlify.toml).
function tickerPath(ticker) {
    return '/' + encodeURIComponent(ticker);
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

/* Ticker Info Page */
// Opened via /WFC (e.g. a middle-click from the watchlist) with nothing cached
// for that ticker: fetch and calculate it, then reload so the normal page
// setup below runs against the fresh cache.
let tickerFromPath = tickerLabelIP ? getTickerFromPath() : null;
if (tickerFromPath) {
    let cachedTicker = null;
    try {
        cachedTicker = JSON.parse(localStorage.getItem('mostRecentCalculations'))?.ticker ?? null;
    } catch (error) { /* treat as uncached */ }
    if (cachedTicker === tickerFromPath) {
        tickerFromPath = null; // already loaded, render normally
    } else {
        getStockData(tickerFromPath, 'mostRecentData').then(data => {
            runStockCalculations(data.prices, tickerFromPath, 'mostRecentCalculations');
            window.location.reload();
        }).catch(error => {
            console.error('Error occurred when retrieving stock data: ', error);
            window.location.href = '/main';
        });
    }
}

if (tickerLabelIP && !tickerFromPath) {
    loadCalculatedValues();
    let ticker = "";
    var storageItem = localStorage.getItem('mostRecentCalculations');
    if (storageItem) {
        try {
            var calculations = JSON.parse(storageItem);
            ticker = calculations.ticker;
        } catch (error) {
            console.error('Error parsing cached calculations: ', error);
        }
    } else {
        console.log("No calculations found in localStorage.");
    }

    setAddToWatchlistButtonState(isTickerInWatchlist(ticker));

    var recentData = localStorage.getItem('mostRecentData');
    try {
        if (recentData) {
            var data = JSON.parse(recentData);
            createStockChart(data);
        } else {
            console.log("No data was found in localStorage.");
        }
    } catch (error) {
        console.log("Error occurred when loading data.");
    }

    stockStatsLink.addEventListener('click', function() {
        var url = 'https://finance.yahoo.com/quote/' + ticker + '/';
        window.open(url, '_blank');
    });
    stockDescLink.addEventListener('click', function() {
        var url = 'https://finance.yahoo.com/quote/' + ticker + '/profile';
        window.open(url, '_blank');
    });
    dividendHistoryLink.addEventListener('click', function() {
        var url = 'https://www.streetinsider.com/dividend_history.php?q=' + ticker;
        window.open(url, '_blank');
    });
    epsChartLink.addEventListener('click', function() {
        var url = 'https://www.zacks.com/stock/chart/' + ticker + '/eps';
        window.open(url, '_blank');
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
        // watchlist(s) first, and commitFolderSelection() does the actual
        // write when "Add" is clicked inside the modal. Kick the stock-info
        // fetch off now (in the background) so it's likely already resolved
        // by the time they click Add, instead of blocking on it here.
        openFolderModal(tickerToAdd, {
            goodBuyPrice: grBLonPage.textContent.replace('$', ''),
            badBuyPrice: bBHonPage.textContent.replace('$', ''),
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
    addToWatchlist.classList.toggle('bg-accent-color', !inWatchlist);
    addToWatchlist.classList.toggle('bg-secondary-color', inWatchlist);
}

function fetchStockInfo(ticker) {
    return new Promise((resolve, reject) => {
        var xhttp = new XMLHttpRequest();
        xhttp.timeout = 15000;
        xhttp.ontimeout = function() {
            reject(new Error('Timed out fetching stock info for ' + ticker));
        };
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4) {
                if (this.status == 200) {
                    try {
                        resolve(JSON.parse(this.responseText));
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    const failure = new Error('Failed to fetch stock info for ' + ticker + ' (status ' + this.status + ')');
                    failure.status = this.status;
                    reject(failure);
                }
            }
        };
        xhttp.open("GET", "/stock-info?ticker=" + encodeURIComponent(ticker), true);
        xhttp.send();
    });
}

// Tells the user which tickers a refresh couldn't update (their old values are
// kept) instead of failing silently; clears itself when everything succeeded.
function setRefreshProgress(done, total) {
    const statusEl = document.getElementById('refreshStatus');
    if (!statusEl) return;
    statusEl.dataset.progress = '1';
    statusEl.textContent = `Refreshing ${done} of ${total}…`;
    statusEl.classList.remove('hidden');
}

function showRefreshStatus(failedTickers) {
    const statusEl = document.getElementById('refreshStatus');
    if (!statusEl) return;
    statusEl.dataset.progress = '';
    if (!failedTickers || failedTickers.length === 0) {
        statusEl.classList.add('hidden');
        statusEl.textContent = '';
        return;
    }
    const shown = failedTickers.slice(0, 5).join(', ');
    const extra = failedTickers.length > 5 ? ` and ${failedTickers.length - 5} more` : '';
    statusEl.textContent = `Couldn't fully refresh ${failedTickers.length} ${failedTickers.length === 1 ? 'ticker' : 'tickers'} (${shown}${extra}). Showing previous values; try again in a minute.`;
    statusEl.classList.remove('hidden');
}

/* Watch List page*/
if(watchlistItemsContainer){
    refreshButton.addEventListener('click', async function(){
        if (refreshButton.disabled) return;
        const user = auth.currentUser;
        if (user) {
            const refreshIcon = refreshButton.querySelector('img');
            refreshButton.disabled = true;
            refreshIcon.classList.add('animate-spin-reverse');
            try {
                const [result, folders] = await Promise.all([
                    updateWatchListValues(user),
                    fetchWatchlistFolders(user.uid)
                ]);
                localStorage.setItem('userWatchlistFolders', JSON.stringify(folders));
                renderFolderDropdown(folders);
                showRefreshStatus(result.failed);
            } finally {
                // If the refresh threw, don't leave "Refreshing n of N…" stuck.
                const statusEl = document.getElementById('refreshStatus');
                if (statusEl && statusEl.dataset.progress === '1') showRefreshStatus([]);
                refreshIcon.classList.remove('animate-spin-reverse');
                refreshButton.disabled = false;
            }
        } else {
            console.error("No user is signed in.");
        }
    });

    sortByNameBtn.addEventListener('click', () => sortWatchlist('ticker'));
    sortByPriceBtn.addEventListener('click', () => sortWatchlist('currentPrice'));
    sortByGBBtn.addEventListener('click', () => sortWatchlist('goodBuyPrice'));
    sortByBBBtn.addEventListener('click', () => sortWatchlist('badBuyPrice'));
    sortByDividendBtn.addEventListener('click', () => sortWatchlist('dividendYield'));

    const mobileSortSelect = document.getElementById('mobileSortSelect');
    const mobileSortDir = document.getElementById('mobileSortDir');
    mobileSortSelect.addEventListener('change', () => {
        currentSortKey = mobileSortSelect.value || null;
        currentSortDirection = currentSortKey === 'currentPrice' ? 'desc' : 'asc';
        runWatchlist(auth.currentUser);
    });
    mobileSortDir.addEventListener('click', () => {
        if (!currentSortKey) {
            // No sort chosen yet: start sorting by name, descending
            currentSortKey = 'ticker';
            currentSortDirection = 'desc';
        } else {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        }
        runWatchlist(auth.currentUser);
    });

    folderDropdownBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        folderDropdownPanel.classList.toggle('hidden');
    });
    document.addEventListener('click', function (event) {
        if (!folderDropdownWrapper.contains(event.target)) {
            folderDropdownPanel.classList.add('hidden');
        }
    });
}

// Folder ("which watchlist?") picker modal — also opened from the Ticker
// Info page right after adding a ticker, not just from the Watch List page,
// so its wiring lives outside the watchlistItemsContainer guard above.
if (folderModalOverlay) {
    folderModalCloseBtn.addEventListener('click', closeFolderModal);
    folderModalOverlay.addEventListener('click', function (event) {
        if (event.target === folderModalOverlay) {
            closeFolderModal();
        }
    });
    folderModalNewFolderForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const name = folderModalNewFolderInput.value.trim();
        const user = auth.currentUser;
        if (!name || !user || !currentModalTicker) return;

        const folder = await createFolder(user.uid, name);
        if (!folder) return;
        // Stage it as selected — actual ticker membership is only written
        // when folderModalAddBtn is clicked, same as the existing checkboxes.
        pendingFolderIds.add(folder.id);
        folderModalNewFolderInput.value = '';
        renderFolderModalList();
        renderFolderDropdown(getCachedFolders());
    });
    folderModalAddBtn.addEventListener('click', commitFolderSelection);
}

// Rename-watchlist modal, opened from the ✎ button in the folder dropdown.
if (renameFolderModalOverlay) {
    renameFolderModalCloseBtn.addEventListener('click', closeRenameFolderModal);
    renameFolderModalCancelBtn.addEventListener('click', closeRenameFolderModal);
    renameFolderModalOverlay.addEventListener('click', function (event) {
        if (event.target === renameFolderModalOverlay) {
            closeRenameFolderModal();
        }
    });
    renameFolderModalForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const user = auth.currentUser;
        const name = renameFolderModalInput.value.trim();
        if (!renamingFolder || !user) return;
        if (!name || name === renamingFolder.name) {
            closeRenameFolderModal();
            return;
        }
        renameFolderModalSaveBtn.disabled = true;
        const success = await renameFolder(user.uid, renamingFolder.id, name);
        renameFolderModalSaveBtn.disabled = false;
        if (!success) return;
        renderFolderDropdown(getCachedFolders());
        closeRenameFolderModal();
    });
}

// Bulk-add modal, opened from the "Bulk Add" button next to the folder dropdown.
if (bulkAddModalOverlay) {
    bulkAddBtn.addEventListener('click', openBulkAddModal);
    bulkAddModalCloseBtn.addEventListener('click', closeBulkAddModal);
    bulkAddModalCancelBtn.addEventListener('click', closeBulkAddModal);
    bulkAddModalOverlay.addEventListener('click', function (event) {
        if (event.target === bulkAddModalOverlay) {
            closeBulkAddModal();
        }
    });
    bulkAddModalForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const user = auth.currentUser;
        if (!user || bulkAddRunning) return;
        await bulkAddTickers(user, bulkAddModalInput.value);
    });
}

function openBulkAddModal() {
    bulkAddModalInput.value = '';
    setBulkAddStatus('');
    bulkAddFolderIds = new Set(currentFolderId ? [currentFolderId] : []);
    renderBulkAddFolders();
    bulkAddModalOverlay.classList.remove('hidden');
    bulkAddModalInput.focus();
}

function closeBulkAddModal() {
    if (bulkAddRunning) return; // don't orphan an in-flight batch
    bulkAddModalOverlay.classList.add('hidden');
}

// Checkbox list of the user's watchlists. "All" is shown locked on (same as
// the single-stock folder modal) since every saved stock appears in All Stocks.
function renderBulkAddFolders() {
    bulkAddFolders.innerHTML = '';
    const folders = getCachedFolders();

    const heading = document.createElement('p');
    heading.className = 'text-text-color text-opacity-60 text-sm';
    heading.textContent = 'Add to:';
    bulkAddFolders.appendChild(heading);

    const allRow = document.createElement('label');
    allRow.className = 'flex items-center gap-2 px-2 py-2 rounded';
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.className = 'accent-accent-color w-4 h-4 laptop:w-5 laptop:h-5 flex-shrink-0 opacity-60';
    allCheckbox.checked = true;
    allCheckbox.disabled = true;
    const allName = document.createElement('span');
    allName.className = 'truncate font-semibold';
    allName.textContent = 'All';
    allRow.appendChild(allCheckbox);
    allRow.appendChild(allName);
    bulkAddFolders.appendChild(allRow);

    folders.forEach((folder) => {
        const row = document.createElement('label');
        row.className = 'flex items-center gap-2 px-2 py-2 rounded hover:bg-secondary-color cursor-pointer';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'accent-accent-color w-4 h-4 laptop:w-5 laptop:h-5 flex-shrink-0';
        checkbox.checked = bulkAddFolderIds.has(folder.id);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                bulkAddFolderIds.add(folder.id);
            } else {
                bulkAddFolderIds.delete(folder.id);
            }
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'truncate';
        nameSpan.textContent = folder.name;

        row.appendChild(checkbox);
        row.appendChild(nameSpan);
        bulkAddFolders.appendChild(row);
    });
}

function setBulkAddStatus(text) {
    bulkAddModalStatus.textContent = text;
    bulkAddModalStatus.classList.toggle('hidden', !text);
}

// Adds every ticker in `rawText` to the watchlist (and to the currently
// watchlist folders ticked in the modal). Each ticker goes through the same
// fetch → calculate → stock-info steps as a refresh in updateWatchListValues(),
// then all successes are written to Firestore in a single batch.
async function bulkAddTickers(user, rawText) {
    const tokens = rawText.split(/[\s,;]+/).filter(Boolean);
    const invalid = [];
    const alreadyAdded = [];
    const toAdd = [];
    const existing = new Set(getCachedWatchList().map(item => item.ticker));
    tokens.forEach((token) => {
        const ticker = sanitizeTicker(token);
        if (!ticker) {
            invalid.push(token);
        } else if (existing.has(ticker)) {
            if (!alreadyAdded.includes(ticker)) alreadyAdded.push(ticker);
        } else if (!toAdd.includes(ticker)) {
            toAdd.push(ticker);
        }
    });

    if (toAdd.length > BULK_ADD_MAX_TICKERS) {
        setBulkAddStatus(`Too many tickers (${toAdd.length}). Please add at most ${BULK_ADD_MAX_TICKERS} at a time.`);
        return;
    }
    if (toAdd.length === 0) {
        const problems = [];
        if (invalid.length) problems.push(`Invalid: ${invalid.join(', ')}`);
        if (alreadyAdded.length) problems.push(`Already on your watch list: ${alreadyAdded.join(', ')}`);
        setBulkAddStatus(problems.length ? problems.join('. ') : 'Enter at least one ticker.');
        return;
    }

    bulkAddRunning = true;
    bulkAddModalSubmitBtn.disabled = true;
    bulkAddModalInput.disabled = true;

    const folderIds = Array.from(bulkAddFolderIds);
    const failed = [];
    let finished = 0;
    setBulkAddStatus(`Adding 0/${toAdd.length}…`);

    const results = await mapWithConcurrencyLimit(toAdd, 4, async (ticker) => {
        try {
            const data = await getStockData(ticker, 'mostRecentData');
            const calculations = runStockCalculations(data.prices, ticker);
            let info = {};
            try {
                info = await fetchStockInfo(ticker);
            } catch (error) {
                console.error(`Error fetching stock info for ${ticker}: `, error);
            }
            return {
                ticker,
                goodBuyPrice: calculations.greatBRLow.toFixed(2),
                badBuyPrice: calculations.badBRHigh.toFixed(2),
                name: info.name || null,
                currentPrice: info.currentPrice ?? null,
                dividendYield: info.dividendYield || null,
                bandsUpdatedAt: Date.now(),
                folderIds
            };
        } catch (error) {
            console.error(`Error adding ${ticker} in bulk: `, error);
            failed.push(ticker);
            return null;
        } finally {
            finished++;
            setBulkAddStatus(`Adding ${finished}/${toAdd.length}…`);
        }
    });

    const entries = results.filter(Boolean);
    let saveFailed = false;
    if (entries.length > 0) {
        try {
            const batch = writeBatch(db);
            entries.forEach((entry) => {
                batch.set(doc(db, `users/${user.uid}/watchlist`, entry.ticker), entry);
            });
            await batch.commit();

            const addedTickers = new Set(entries.map(entry => entry.ticker));
            const watchList = [...getCachedWatchList().filter(item => !addedTickers.has(item.ticker)), ...entries];
            localStorage.setItem('userWatchListData', JSON.stringify(watchList));
            renderFolderDropdown(getCachedFolders());
            runWatchlist(user);
        } catch (error) {
            console.error('Error saving bulk-added watchlist items: ', error);
            saveFailed = true;
        }
    }

    bulkAddRunning = false;
    bulkAddModalSubmitBtn.disabled = false;
    bulkAddModalInput.disabled = false;

    if (saveFailed) {
        setBulkAddStatus("Couldn't save these stocks to your watch list. Please try again.");
        return;
    }

    const notes = [`Added ${entries.length}.`];
    if (failed.length) notes.push(`Couldn't load: ${failed.join(', ')}.`);
    if (invalid.length) notes.push(`Invalid: ${invalid.join(', ')}.`);
    if (alreadyAdded.length) notes.push(`Already on your watch list: ${alreadyAdded.join(', ')}.`);
    if (notes.length === 1) {
        closeBulkAddModal();
    } else {
        setBulkAddStatus(notes.join(' '));
    }
}

function openRenameFolderModal(folder) {
    renamingFolder = folder;
    renameFolderModalInput.value = folder.name;
    renameFolderModalOverlay.classList.remove('hidden');
    renameFolderModalInput.focus();
    renameFolderModalInput.select();
}

function closeRenameFolderModal() {
    renameFolderModalOverlay.classList.add('hidden');
    renamingFolder = null;
}

// Generic "are you sure?" modal used before removing a ticker from the
// watch list — `execute` performs the actual Firestore delete + DOM/cache
// cleanup once the user confirms.
if (deleteConfirmModalOverlay) {
    deleteConfirmModalCloseBtn.addEventListener('click', closeDeleteConfirmModal);
    deleteConfirmModalCancelBtn.addEventListener('click', closeDeleteConfirmModal);
    deleteConfirmModalOverlay.addEventListener('click', function (event) {
        if (event.target === deleteConfirmModalOverlay) {
            closeDeleteConfirmModal();
        }
    });
    deleteConfirmModalConfirmBtn.addEventListener('click', async function () {
        if (!pendingDeleteAction) return;
        const execute = pendingDeleteAction;
        deleteConfirmModalConfirmBtn.disabled = true;
        await execute();
        deleteConfirmModalConfirmBtn.disabled = false;
        closeDeleteConfirmModal();
    });
}

function openDeleteConfirmModal(ticker, execute) {
    pendingDeleteAction = execute;
    deleteConfirmModalMessage.textContent = `Remove ${ticker} from your watch list?`;
    deleteConfirmModalOverlay.classList.remove('hidden');
}

function closeDeleteConfirmModal() {
    deleteConfirmModalOverlay.classList.add('hidden');
    pendingDeleteAction = null;
}

// Buy ranges are built only from monthly closes (the scraper keeps rows dated
// the 1st), so within a month a fresh scrape returns the same numbers. A
// refresh therefore skips the history fetch while an item's ranges are
// "fresh" and only updates the live price.
const BANDS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // backstop, mainly for splits
const SPLIT_JUMP_RATIO = 1.3; // price moved >30% since the last refresh

// Calendar date in New York, the timezone Yahoo's history dates use.
function newYorkDate(ms) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric'
    }).formatToParts(new Date(ms));
    const part = (type) => Number(parts.find((p) => p.type === type).value);
    return { year: part('year'), month: part('month'), day: part('day') };
}

function bandsAreFresh(item, now = Date.now()) {
    if (!item.bandsUpdatedAt) return false;
    if (now - item.bandsUpdatedAt > BANDS_MAX_AGE_MS) return false;
    const calculated = newYorkDate(item.bandsUpdatedAt);
    const current = newYorkDate(now);
    if (calculated.year !== current.year || calculated.month !== current.month) return false;
    // The 1st's close is still moving that day, so ranges calculated then
    // are recalculated once on a later day.
    if (calculated.day === 1 && current.day > 1) return false;
    return true;
}

// A sudden large price change since the last refresh usually means a stock
// split (which rewrites all past prices), so the ranges must be recalculated.
function priceJumped(oldPrice, newPrice) {
    const before = Number(oldPrice);
    const after = Number(newPrice);
    if (!(before > 0) || !(after > 0)) return false;
    const ratio = after / before;
    return ratio > SPLIT_JUMP_RATIO || ratio < 1 / SPLIT_JUMP_RATIO;
}

// Runs the requested items through `mapper`, but never more than `limit` at
// once — used to cap how many concurrent requests a watchlist refresh can
// fire at the backend (and, behind it, at Yahoo).
async function mapWithConcurrencyLimit(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
        while (nextIndex < items.length) {
            const current = nextIndex++;
            results[current] = await mapper(items[current], current);
        }
    }
    const workerCount = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
}

async function updateWatchListValues(user) {
    const watchlistItems = await fetchWatchlistItems(user.uid);

    // Per-refresh tallies, summarised once at the end (see below) so a
    // failure burst shows up as one log line instead of N.
    const refreshStats = { historyOk: 0, historyFailed: 0, historySkipped: 0, splitSuspected: 0, infoOk: 0, infoFailed: 0, statuses: {} };
    const failedTickers = new Set();
    const refreshStartedAt = Date.now();

    // Progressive rendering: as each ticker finishes, write just its refreshed
    // fields into the cached list and repaint (throttled), so rows update as
    // they arrive instead of all at once after the slowest ticker. Tickers
    // removed from the cache mid-refresh are not resurrected, and folderIds
    // are left as the cache has them.
    let completed = 0;
    let renderTimer = null;
    const pendingTickers = new Set();
    // Repaints only the rows whose data changed since the last flush, in place.
    const flushPendingRows = () => {
        const tickers = Array.from(pendingTickers);
        pendingTickers.clear();
        const cachedByTicker = new Map(getCachedWatchList().map((cachedItem) => [cachedItem.ticker, cachedItem]));
        tickers.forEach((ticker) => {
            const cachedItem = cachedByTicker.get(ticker);
            if (cachedItem) updateWatchlistRowInPlace(cachedItem);
        });
    };
    const scheduleRender = (ticker) => {
        pendingTickers.add(ticker);
        if (renderTimer) return;
        renderTimer = setTimeout(() => {
            renderTimer = null;
            flushPendingRows();
        }, 400);
    };
    const onItemDone = (updatedItem, isRetry) => {
        if (!isRetry) {
            completed++;
            setRefreshProgress(completed, watchlistItems.length);
        }
        const cached = getCachedWatchList();
        if (!cached.some((cachedItem) => cachedItem.ticker === updatedItem.ticker)) return;
        localStorage.setItem('userWatchListData', JSON.stringify(cached.map((cachedItem) => (
            cachedItem.ticker === updatedItem.ticker
                ? {
                    ...cachedItem,
                    goodBuyPrice: updatedItem.goodBuyPrice,
                    badBuyPrice: updatedItem.badBuyPrice,
                    name: updatedItem.name,
                    currentPrice: updatedItem.currentPrice,
                    dividendYield: updatedItem.dividendYield,
                    bandsUpdatedAt: updatedItem.bandsUpdatedAt
                }
                : cachedItem
        ))));
        scheduleRender(updatedItem.ticker);
    };
    setRefreshProgress(0, watchlistItems.length);

    // Tickers that hit the server's rate limit (429) get one retry pass after
    // the main pass, once the limit window has had a moment to ease.
    const retryTickers = new Set();
    const tallyFailure = (kind, error, ticker) => {
        refreshStats[kind + 'Failed']++;
        failedTickers.add(ticker);
        if (error && error.status === 429) retryTickers.add(ticker);
        const status = error && error.status ? error.status : 'none';
        refreshStats.statuses[status] = (refreshStats.statuses[status] || 0) + 1;
    };

    const updateOne = async (item, isRetry = false) => {
        // A retry that succeeds should clear the ticker's earlier failure.
        failedTickers.delete(item.ticker);
        let updatedItem = {
            ticker: item.ticker,
            goodBuyPrice: item.goodBuyPrice,
            badBuyPrice: item.badBuyPrice,
            name: item.name || null,
            currentPrice: item.currentPrice ?? null,
            dividendYield: item.dividendYield ?? null,
            bandsUpdatedAt: item.bandsUpdatedAt ?? null,
            folderIds: Array.isArray(item.folderIds) ? item.folderIds : []
        };
        // No cache key is passed to getStockData: concurrent bulk callers
        // would overwrite the shared mostRecentData the ticker page reads.
        const settle = (promise) => promise.then(
            (value) => ({ status: 'fulfilled', value }),
            (reason) => ({ status: 'rejected', reason })
        );

        let historyResult = null;
        let infoResult;
        if (bandsAreFresh(item)) {
            // Ranges are still valid: fetch only the price, and fetch history
            // too only if the price jumped enough to suggest a split.
            infoResult = await settle(fetchStockInfo(item.ticker));
            if (infoResult.status === 'fulfilled' && priceJumped(item.currentPrice, infoResult.value.currentPrice)) {
                refreshStats.splitSuspected++;
                historyResult = await settle(getStockData(item.ticker));
            } else {
                refreshStats.historySkipped++;
            }
        } else {
            // History and price don't depend on each other, so fetch both at once.
            [historyResult, infoResult] = await Promise.all([
                settle(getStockData(item.ticker)),
                settle(fetchStockInfo(item.ticker))
            ]);
        }

        if (historyResult && historyResult.status === 'fulfilled') {
            try {
                const calculations = runStockCalculations(historyResult.value.prices, item.ticker);
                updatedItem.goodBuyPrice = calculations.greatBRLow.toFixed(2);
                updatedItem.badBuyPrice = calculations.badBRHigh.toFixed(2);
                updatedItem.bandsUpdatedAt = Date.now();
                refreshStats.historyOk++;
            } catch (error) {
                tallyFailure('history', error, item.ticker);
                console.warn(`Error calculating ${item.ticker}: `, error);
            }
        } else if (historyResult) {
            // bandsUpdatedAt is left unchanged so the next refresh retries.
            tallyFailure('history', historyResult.reason, item.ticker);
            // console.warn (not console.error): error calls are each reported
            // to the server, and the [refresh-summary] already covers failures.
            console.warn(`Error refreshing ${item.ticker}: `, historyResult.reason);
        }

        // Each half updates independently: a failed history fetch no longer
        // blocks a fresh price, and vice versa.
        if (infoResult.status === 'fulfilled') {
            const info = infoResult.value;
            updatedItem.name = info.name || item.name || null;
            updatedItem.currentPrice = info.currentPrice ?? item.currentPrice ?? null;
            updatedItem.dividendYield = info.dividendYield ?? item.dividendYield ?? null;
            refreshStats.infoOk++;
        } else {
            tallyFailure('info', infoResult.reason, item.ticker);
            console.warn(`Error fetching stock info for ${item.ticker}: `, infoResult.reason);
        }
        onItemDone(updatedItem, isRetry);
        return updatedItem;
    };

    // Cap concurrency (instead of firing every item's requests at once) and
    // batch the Firestore writes into one round trip instead of N.
    const updatedWatchlistItems = await mapWithConcurrencyLimit(watchlistItems, 8, (item) => updateOne(item));

    // One gentler retry pass for tickers the server rate-limited. The first
    // pass's result is retried (not the original), so a ticker whose history
    // already succeeded is fresh and only re-fetches its price.
    const toRetry = updatedWatchlistItems.filter((updatedItem) => retryTickers.has(updatedItem.ticker));
    retryTickers.clear();
    if (toRetry.length > 0) {
        refreshStats.retried = toRetry.length;
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const retried = await mapWithConcurrencyLimit(toRetry, 4, (item) => updateOne(item, true));
        retried.forEach((retriedItem) => {
            const index = updatedWatchlistItems.findIndex((updatedItem) => updatedItem.ticker === retriedItem.ticker);
            if (index !== -1) updatedWatchlistItems[index] = retriedItem;
        });
    }
    clearTimeout(renderTimer);
    renderTimer = null;
    flushPendingRows();

    // One-line outcome for the whole refresh. Failures (e.g. 429s from the
    // server rate limiter) are also sent to the server log via recordError.
    const refreshSummary = JSON.stringify({
        tickers: watchlistItems.length,
        ...refreshStats,
        ms: Date.now() - refreshStartedAt
    });
    console.warn('[refresh-summary]', refreshSummary);
    if (refreshStats.historyFailed + refreshStats.infoFailed > 0) {
        recordError('refresh-summary', refreshSummary);
    }

    const batch = writeBatch(db);
    updatedWatchlistItems.forEach((updatedItem) => {
        const userDocRef = doc(db, `users/${user.uid}/watchlist`, updatedItem.ticker);
        batch.update(userDocRef, {
            goodBuyPrice: updatedItem.goodBuyPrice,
            badBuyPrice: updatedItem.badBuyPrice,
            name: updatedItem.name,
            currentPrice: updatedItem.currentPrice,
            dividendYield: updatedItem.dividendYield,
            bandsUpdatedAt: updatedItem.bandsUpdatedAt ?? null
        });
    });
    await batch.commit();

    localStorage.setItem('userWatchListData', JSON.stringify(updatedWatchlistItems));
    // Rows were already updated in place as they arrived. A full rebuild is
    // only needed to re-sort, since refreshed prices can change the order.
    if (currentSortKey) {
        runWatchlist(user);
    }
    return { failed: Array.from(failedTickers) };
}


async function runWatchlist(user) {
    var watchListItems = localStorage.getItem('userWatchListData');
    var parsedWatchList = [];
    try {
        parsedWatchList = watchListItems ? JSON.parse(watchListItems) : [];
    } catch (error) {
        console.error('Error parsing cached watchlist: ', error);
    }

    var visibleWatchList = currentFolderId
        ? parsedWatchList.filter(item => Array.isArray(item.folderIds) && item.folderIds.includes(currentFolderId))
        : parsedWatchList;

    if (currentSortKey) {
        visibleWatchList.sort((a, b) => {
            // Price sort only orders stocks inside their buy range; the rest stay last
            if (currentSortKey === 'currentPrice') {
                const inRangeA = isWithinBuyRange(a);
                const inRangeB = isWithinBuyRange(b);
                if (inRangeA !== inRangeB) return inRangeA ? -1 : 1;
                if (!inRangeA) return 0;
            }
            const comparison = currentSortKey === 'priceTier'
                ? getBuyTierPosition(a) - getBuyTierPosition(b)
                : compareWatchlistValues(a[currentSortKey], b[currentSortKey], currentSortKey);
            return currentSortDirection === 'asc' ? comparison : -comparison;
        });
    }

    updateWatchlistUI(visibleWatchList);
    updateSortIndicators();
}

function sortWatchlist(key) {
    if (key === 'currentPrice') {
        // Price column cycles: price high -> low, price low -> high, buy tier (best first)
        if (currentSortKey === 'currentPrice' && currentSortDirection === 'desc') {
            currentSortDirection = 'asc';
        } else if (currentSortKey === 'currentPrice') {
            currentSortKey = 'priceTier';
            currentSortDirection = 'asc';
        } else {
            currentSortKey = 'currentPrice';
            currentSortDirection = 'desc';
        }
    } else if (currentSortKey === key) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortKey = key;
        currentSortDirection = 'asc';
    }
    runWatchlist(auth.currentUser);
}

// Where the current price sits within the item's good-to-bad buy span (0 = at the
// great-buy end, 1 = at the bad-buy end). Below the span is negative (best), and
// items with missing data sort last. Ordering by this orders by buy tier.
function getBuyTierPosition(item) {
    const price = Number(item.currentPrice);
    const min = Number(item.goodBuyPrice);
    const max = Number(item.badBuyPrice);
    if (!Number.isFinite(price) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        return Infinity;
    }
    return (price - min) / (max - min);
}

function isWithinBuyRange(item) {
    const position = getBuyTierPosition(item);
    return position >= 0 && position <= 1;
}

function compareWatchlistValues(valueA, valueB, key) {
    if (key === 'ticker') {
        return String(valueA).localeCompare(String(valueB));
    }
    const numA = parseFloat(String(valueA ?? '').replace('$', '')) || 0;
    const numB = parseFloat(String(valueB ?? '').replace('$', '')) || 0;
    return numA - numB;
}

function updateSortIndicators() {
    const arrowByKey = {
        ticker: sortByNameArrow,
        currentPrice: sortByPriceArrow,
        goodBuyPrice: sortByGBArrow,
        badBuyPrice: sortByBBArrow,
        dividendYield: sortByDividendArrow
    };

    Object.entries(arrowByKey).forEach(([key, el]) => {
        if (!el) return;
        const arrow = currentSortDirection === 'asc' ? '▲' : '▼';
        if (key === 'currentPrice' && currentSortKey === 'priceTier') {
            el.textContent = '★';
        } else {
            el.textContent = key === currentSortKey ? arrow : '';
        }
    });

    const mobileSortSelect = document.getElementById('mobileSortSelect');
    const mobileSortDir = document.getElementById('mobileSortDir');
    if (mobileSortSelect) mobileSortSelect.value = currentSortKey || '';
    if (mobileSortDir) mobileSortDir.querySelector('svg').style.transform = currentSortDirection === 'asc' ? '' : 'rotate(180deg)';
}

async function fetchWatchlistItems(uid) {
    const watchlistCollectionRef = collection(db, `users/${uid}/watchlist`);
    try {
        const querySnapshot = await getDocs(watchlistCollectionRef);
        let watchlistItems = [];
        querySnapshot.forEach((doc) => {
            let data = doc.data();
            watchlistItems.push({
                ticker: doc.id,
                goodBuyPrice: data.goodBuyPrice,
                badBuyPrice: data.badBuyPrice,
                name: data.name || null,
                currentPrice: data.currentPrice ?? null,
                dividendYield: data.dividendYield || null,
                bandsUpdatedAt: data.bandsUpdatedAt ?? null,
                folderIds: Array.isArray(data.folderIds) ? data.folderIds : []
            });
        });
        return watchlistItems;
    } catch (e) {
        console.error("Error fetching watchlist items: ", e);
        return [];
    }
}

/* Watch List Folders */

function getCachedFolders() {
    const raw = localStorage.getItem('userWatchlistFolders');
    try {
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.error('Error parsing cached watchlist folders: ', error);
        return [];
    }
}

function getCachedWatchList() {
    const raw = localStorage.getItem('userWatchListData');
    try {
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.error('Error parsing cached watchlist: ', error);
        return [];
    }
}

async function fetchWatchlistFolders(uid) {
    const foldersCollectionRef = collection(db, `users/${uid}/watchlistFolders`);
    try {
        const querySnapshot = await getDocs(foldersCollectionRef);
        let folders = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            folders.push({ id: docSnap.id, name: data.name || 'Untitled', createdAt: data.createdAt ?? 0 });
        });
        folders.sort((a, b) => a.createdAt - b.createdAt);
        return folders;
    } catch (e) {
        console.error("Error fetching watchlist folders: ", e);
        return [];
    }
}

async function createFolder(uid, name) {
    const foldersCollectionRef = collection(db, `users/${uid}/watchlistFolders`);
    const newDocRef = doc(foldersCollectionRef);
    const folder = { id: newDocRef.id, name: name, createdAt: Date.now() };
    try {
        await setDoc(newDocRef, { name: folder.name, createdAt: folder.createdAt });
    } catch (e) {
        console.error("Error creating folder: ", e);
        alert("Couldn't save the new watchlist to your account. Please try again.");
        return null;
    }
    const folders = getCachedFolders();
    folders.push(folder);
    localStorage.setItem('userWatchlistFolders', JSON.stringify(folders));
    return folder;
}

async function renameFolder(uid, folderId, name) {
    try {
        await updateDoc(doc(db, `users/${uid}/watchlistFolders`, folderId), { name: name });
    } catch (e) {
        console.error("Error renaming folder: ", e);
        alert("Couldn't rename the watchlist. Please try again.");
        return false;
    }
    const folders = getCachedFolders().map(folder => folder.id === folderId ? { ...folder, name: name } : folder);
    localStorage.setItem('userWatchlistFolders', JSON.stringify(folders));
    if (currentFolderId === folderId) {
        folderDropdownLabel.textContent = name;
    }
    return true;
}

async function deleteFolder(uid, folderId) {
    try {
        await deleteDoc(doc(db, `users/${uid}/watchlistFolders`, folderId));

        const watchlistCollectionRef = collection(db, `users/${uid}/watchlist`);
        const querySnapshot = await getDocs(watchlistCollectionRef);
        const removals = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (Array.isArray(data.folderIds) && data.folderIds.includes(folderId)) {
                removals.push(updateDoc(docSnap.ref, { folderIds: arrayRemove(folderId) }));
            }
        });
        await Promise.all(removals);
    } catch (e) {
        console.error("Error deleting folder: ", e);
        alert("Couldn't delete the watchlist. Please try again.");
        return false;
    }

    const folders = getCachedFolders().filter(folder => folder.id !== folderId);
    localStorage.setItem('userWatchlistFolders', JSON.stringify(folders));

    const watchList = getCachedWatchList().map((item) => {
        if (Array.isArray(item.folderIds) && item.folderIds.includes(folderId)) {
            return { ...item, folderIds: item.folderIds.filter(id => id !== folderId) };
        }
        return item;
    });
    localStorage.setItem('userWatchListData', JSON.stringify(watchList));

    if (currentFolderId === folderId) {
        currentFolderId = null;
        folderDropdownLabel.textContent = 'All Stocks';
    }
    return true;
}

async function initWatchlistFolders(user) {
    const folders = await fetchWatchlistFolders(user.uid);
    localStorage.setItem('userWatchlistFolders', JSON.stringify(folders));
    renderFolderDropdown(folders);
}

function renderFolderDropdown(folders) {
    if (!folderDropdownPanel) return;
    folderDropdownPanel.innerHTML = '';
    const watchList = getCachedWatchList();

    const allRow = document.createElement('button');
    allRow.type = 'button';
    allRow.className = 'flex justify-between items-center gap-2 w-full px-3 py-2 text-left hover:bg-text-color hover:bg-opacity-10 transition-colors duration-150' + (currentFolderId === null ? ' text-accent-color font-semibold' : '');
    allRow.innerHTML = `<span>All Stocks</span><span class="opacity-60">${watchList.length}</span>`;
    allRow.addEventListener('click', () => selectFolder(null, 'All Stocks'));
    folderDropdownPanel.appendChild(allRow);

    folders.forEach((folder) => {
        const count = watchList.filter(item => Array.isArray(item.folderIds) && item.folderIds.includes(folder.id)).length;

        const row = document.createElement('div');
        row.className = 'flex items-center gap-1 px-2 py-1 hover:bg-text-color hover:bg-opacity-10 transition-colors duration-150';

        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'flex justify-between items-center gap-2 flex-1 min-w-0 text-left' + (currentFolderId === folder.id ? ' text-accent-color font-semibold' : '');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'truncate';
        nameSpan.textContent = folder.name;
        const countSpan = document.createElement('span');
        countSpan.className = 'opacity-60 flex-shrink-0';
        countSpan.textContent = count;
        selectBtn.appendChild(nameSpan);
        selectBtn.appendChild(countSpan);
        selectBtn.addEventListener('click', () => selectFolder(folder.id, folder.name));

        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'flex-shrink-0 opacity-40 hover:opacity-100 hover:text-accent-color px-1';
        renameBtn.textContent = '✎';
        renameBtn.title = `Rename watchlist "${folder.name}"`;
        renameBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            folderDropdownPanel.classList.add('hidden');
            openRenameFolderModal(folder);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'flex-shrink-0 opacity-40 hover:opacity-100 hover:text-desperate-buy-one px-1';
        deleteBtn.textContent = '✕';
        deleteBtn.title = `Delete watchlist "${folder.name}"`;
        deleteBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const user = auth.currentUser;
            if (!user) return;
            if (confirm(`Delete watchlist "${folder.name}"? Stocks will stay in your watchlist.`)) {
                const wasActiveFilter = currentFolderId === folder.id;
                const success = await deleteFolder(user.uid, folder.id);
                if (!success) return;
                renderFolderDropdown(getCachedFolders());
                if (wasActiveFilter) {
                    runWatchlist(user);
                }
            }
        });

        row.appendChild(selectBtn);
        row.appendChild(renameBtn);
        row.appendChild(deleteBtn);
        folderDropdownPanel.appendChild(row);
    });

    const divider = document.createElement('div');
    divider.className = 'border-t border-text-color border-opacity-20 my-1';
    folderDropdownPanel.appendChild(divider);

    const newFolderForm = document.createElement('form');
    newFolderForm.className = 'flex gap-1 px-2 py-1';
    const newFolderInput = document.createElement('input');
    newFolderInput.type = 'text';
    newFolderInput.placeholder = 'New watchlist';
    newFolderInput.maxLength = 40;
    newFolderInput.autocomplete = 'off';
    newFolderInput.className = 'flex-1 min-w-0 bg-background rounded px-2 py-1 text-text-color placeholder-text-color placeholder-opacity-50 outline-none text-xs laptop:text-sm';
    const newFolderSubmit = document.createElement('button');
    newFolderSubmit.type = 'submit';
    newFolderSubmit.className = 'flex-shrink-0 bg-accent-color text-background rounded px-2 text-xs laptop:text-sm font-semibold';
    newFolderSubmit.textContent = '+';
    newFolderForm.appendChild(newFolderInput);
    newFolderForm.appendChild(newFolderSubmit);
    newFolderForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = newFolderInput.value.trim();
        const user = auth.currentUser;
        if (!name || !user) return;
        const folder = await createFolder(user.uid, name);
        if (!folder) return;
        renderFolderDropdown(getCachedFolders());
    });
    folderDropdownPanel.appendChild(newFolderForm);
}

function selectFolder(folderId, label) {
    currentFolderId = folderId;
    folderDropdownLabel.textContent = label;
    folderDropdownPanel.classList.add('hidden');
    renderFolderDropdown(getCachedFolders());
    runWatchlist(auth.currentUser);
}

// `newEntry`, when passed, means `ticker` isn't on the watchlist yet — the
// modal is being used to add it for the first time (from the Ticker Info
// page's "Add To Watchlist" button) rather than to reorganize an existing
// item. Nothing is written to Firestore until commitFolderSelection() runs.
function openFolderModal(ticker, newEntry = null) {
    const user = auth.currentUser;
    if (!user) {
        console.error("No user is signed in.");
        return;
    }
    currentModalTicker = ticker;
    pendingNewEntry = newEntry;
    const item = getCachedWatchList().find(watchListItem => watchListItem.ticker === ticker);
    const itemFolderIds = (item && Array.isArray(item.folderIds)) ? item.folderIds : [];
    pendingFolderIds = new Set(itemFolderIds);
    pendingKeepInAll = true;
    folderModalTitle.textContent = newEntry ? `Add ${ticker} to a Watchlist` : `Modify ${ticker} Watchlist(s)`;
    folderModalAddBtn.textContent = newEntry ? 'Add' : 'Save';
    renderFolderModalList();
    folderModalOverlay.classList.remove('hidden');
}

function closeFolderModal() {
    folderModalOverlay.classList.add('hidden');
    currentModalTicker = null;
    pendingFolderIds = new Set();
    pendingNewEntry = null;
    pendingKeepInAll = true;
}

// Writes the staged pendingFolderIds selection to Firestore in one shot,
// then closes the modal — nothing is saved until this runs. For a brand new
// ticker (pendingNewEntry set), this is also what actually adds it to the
// watchlist in the first place.
async function commitFolderSelection() {
    const user = auth.currentUser;
    if (!user || !currentModalTicker) return;

    const ticker = currentModalTicker;
    const folderIds = Array.from(pendingFolderIds);
    const newEntry = pendingNewEntry;

    if (!newEntry && !pendingKeepInAll) {
        openDeleteConfirmModal(ticker, async function () {
            const success = await deleteFromFirebase(ticker);
            if (!success) {
                alert(`Couldn't remove ${ticker} from your watchlist. Please try again.`);
                return;
            }
            const updatedWatchList = getCachedWatchList().filter(item => item.ticker !== ticker);
            localStorage.setItem('userWatchListData', JSON.stringify(updatedWatchList));
            if (addToWatchlist) {
                setAddToWatchlistButtonState(false);
            }
            if (watchlistItemsContainer) {
                runWatchlist(user);
            }
            closeFolderModal();
        });
        return;
    }

    folderModalAddBtn.disabled = true;
    let newCacheEntry = null;
    try {
        if (newEntry) {
            const info = await newEntry.infoPromise;
            newCacheEntry = {
                ticker,
                goodBuyPrice: newEntry.goodBuyPrice,
                badBuyPrice: newEntry.badBuyPrice,
                name: info.name || null,
                currentPrice: info.currentPrice ?? null,
                dividendYield: info.dividendYield || null,
                bandsUpdatedAt: Date.now(),
                folderIds
            };
            await setDoc(doc(db, `users/${user.uid}/watchlist`, ticker), newCacheEntry);
        } else {
            await updateDoc(doc(db, `users/${user.uid}/watchlist`, ticker), { folderIds });
        }
    } catch (e) {
        console.error("Error saving watchlist item: ", e);
        alert("Couldn't save this stock to your watchlist. Please try again.");
        folderModalAddBtn.disabled = false;
        return;
    }
    folderModalAddBtn.disabled = false;

    const existingList = getCachedWatchList();
    const watchList = newCacheEntry
        ? [...existingList.filter(item => item.ticker !== ticker), newCacheEntry]
        : existingList.map((item) => item.ticker === ticker ? { ...item, folderIds } : item);
    localStorage.setItem('userWatchListData', JSON.stringify(watchList));

    if (newCacheEntry && addToWatchlist) {
        setAddToWatchlistButtonState(true);
    }

    renderFolderDropdown(getCachedFolders());
    if (watchlistItemsContainer) {
        runWatchlist(user);
    }
    closeFolderModal();
}

// Every watchlist item belongs to the unfiltered "All" list. For a ticker
// that's already saved, unchecking "All" stages a full removal (confirmed in
// commitFolderSelection()); for a ticker being added it stays locked on.
function createAllWatchlistRow() {
    const editable = !pendingNewEntry;
    const row = document.createElement('label');
    row.className = 'flex items-center gap-2 px-2 py-2 rounded' + (editable ? ' hover:bg-secondary-color cursor-pointer' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'accent-accent-color w-4 h-4 laptop:w-5 laptop:h-5 flex-shrink-0' + (editable ? '' : ' opacity-60');
    checkbox.checked = pendingKeepInAll;
    checkbox.disabled = !editable;
    checkbox.addEventListener('change', () => {
        pendingKeepInAll = checkbox.checked;
        renderFolderModalList();
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'truncate font-semibold';
    nameSpan.textContent = 'All';

    row.appendChild(checkbox);
    row.appendChild(nameSpan);
    return row;
}

function renderFolderModalList() {
    folderModalList.innerHTML = '';
    const folders = getCachedFolders();

    folderModalList.appendChild(createAllWatchlistRow());

    if (folders.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-text-color text-opacity-60 text-sm text-center py-2';
        empty.textContent = 'No watchlists yet. Create one below.';
        folderModalList.appendChild(empty);
        return;
    }

    const divider = document.createElement('div');
    divider.className = 'border-t border-text-color border-opacity-20 my-1';
    folderModalList.appendChild(divider);

    folders.forEach((folder) => {
        const row = document.createElement('label');
        row.className = 'flex items-center gap-2 px-2 py-2 rounded ' + (pendingKeepInAll ? 'hover:bg-secondary-color cursor-pointer' : 'opacity-50');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'accent-accent-color w-4 h-4 laptop:w-5 laptop:h-5 flex-shrink-0';
        checkbox.checked = pendingKeepInAll && pendingFolderIds.has(folder.id);
        checkbox.disabled = !pendingKeepInAll;
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                pendingFolderIds.add(folder.id);
            } else {
                pendingFolderIds.delete(folder.id);
            }
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'truncate';
        nameSpan.textContent = folder.name;

        row.appendChild(checkbox);
        row.appendChild(nameSpan);
        folderModalList.appendChild(row);
    });
}

function updateWatchlistUI(watchListItems) {
    const watchlistItemsContainer = document.getElementById('watchlistItemsContainer');
    const watchlistCardsContainer = document.getElementById('watchlistCardsContainer');
    watchlistItemsContainer.innerHTML = '';
    watchlistCardsContainer.innerHTML = '';

    if (watchListItems.length === 0) {
        watchlistCardsContainer.appendChild(createEmptyWatchlistCard());
    }

    watchListItems.forEach((item, index) => {
        const stockContainer = createStockContainerItem(item);
        const stockCard = createStockCardItem(item);
        stockContainer.dataset.ticker = item.ticker;
        stockCard.dataset.ticker = item.ticker;
        setTimeout(() => {
            stockContainer.classList.add('fade-in-slow');
            stockCard.classList.add('fade-in-slow');
        }, index * 75);

        watchlistItemsContainer.appendChild(stockContainer);
        watchlistCardsContainer.appendChild(stockCard);
    });
}

// Swaps one ticker's already-rendered row/card for a fresh one built from
// `item`, leaving every other row untouched (no clear, no re-fade). Used for
// progressive refresh updates; a ticker that isn't on screen (e.g. filtered
// out by the current folder) is simply skipped.
function updateWatchlistRowInPlace(item) {
    const selector = `[data-ticker="${CSS.escape(item.ticker)}"]`;
    const oldContainer = document.querySelector('#watchlistItemsContainer ' + selector);
    const oldCard = document.querySelector('#watchlistCardsContainer ' + selector);
    if (oldContainer) {
        const stockContainer = createStockContainerItem(item);
        stockContainer.dataset.ticker = item.ticker;
        stockContainer.style.opacity = 1; // createStockContainerItem starts at 0, waiting on the fade-in
        oldContainer.replaceWith(stockContainer);
    }
    if (oldCard) {
        const stockCard = createStockCardItem(item);
        stockCard.dataset.ticker = item.ticker;
        oldCard.replaceWith(stockCard);
    }
}

function createEmptyWatchlistCard() {
    const card = document.createElement('div');
    card.className = 'card flex flex-col items-center gap-2 p-6 text-center';

    const message = document.createElement('div');
    message.className = 'text-text-color font-semibold';
    message.textContent = 'No stocks yet';

    const cta = document.createElement('a');
    cta.href = '/main';
    cta.className = 'text-accent-color text-sm font-semibold hover:underline';
    cta.textContent = 'Search for a ticker';

    card.appendChild(message);
    card.appendChild(cta);
    return card;
}


// A watchlist item only stores the outer bounds of the buy-range (goodBuyPrice
// = greatBRLow, badBuyPrice = badBRHigh), not the four individual bands —
// but runStockCalculations() always splits that span into 8 equal steps
// (great/good/okay bands each 1 step wide, separated by 1-step gaps, with the
// bad band spanning the final 2 steps), so the bands can be reconstructed
// from just those two bounds without re-fetching price history.
function getCurrentPriceRangeColorClass(currentPrice, goodBuyPrice, badBuyPrice) {
    const price = Number(currentPrice);
    const min = Number(goodBuyPrice);
    const max = Number(badBuyPrice);
    if (!Number.isFinite(price) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        return null;
    }

    if (price < min) {
        return 'bg-purple-500';
    }

    const step = (max - min) / 8;
    // The 1-step gaps between bands belong to the cheaper band below them, so a
    // price that falls in a gap still gets a tier color instead of none.
    if (price < min + 2 * step) return 'bg-great-buy-one';
    if (price < min + 4 * step) return 'bg-good-buy-one';
    if (price < min + 6 * step) return 'bg-okay-buy-one';
    if (price <= max) return 'bg-desperate-buy-one';

    return null;
}

function createStockContainerItem(item) {
    const container = document.createElement('div');
    container.className = 'stock-container';
    container.style.opacity = 0;

    const stockItem = document.createElement('div');
    // Column widths (grid-cols) must stay in sync with the header row template in watchlist.html, or header/row columns drift out of alignment
    stockItem.className = 'stock-item transition duration-150 hover:brightness-125 hover:drop-shadow-xl hover:-translate-y-0.5 grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1.75rem_1.75rem] laptop:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_2.5rem_2.5rem] w-full items-stretch min-h-7 laptop:min-h-9 text-background text-[10px] laptop:text-base desktop:text-lg desktopXL:text-xl select-none font-semibold';

    const cellBaseClass = 'flex justify-center items-center text-center leading-tight px-1 py-1 select-none min-w-0 border-r border-background';

    // A real link (/WFC) so middle-click / ctrl-click open the ticker in a new tab.
    const nameDiv = document.createElement('a');
    nameDiv.href = tickerPath(item.ticker);
    nameDiv.className = cellBaseClass + ' bg-text-color rounded-l hover:cursor-pointer';
    nameDiv.textContent = item.name ? `${item.name} (${item.ticker})` : item.ticker;
    nameDiv.title = nameDiv.textContent;

    const priceDiv = document.createElement('div');
    const priceRangeColorClass = getCurrentPriceRangeColorClass(item.currentPrice, item.goodBuyPrice, item.badBuyPrice);
    priceDiv.className = cellBaseClass + ' ' + (priceRangeColorClass || 'bg-secondary-color');
    priceDiv.textContent = item.currentPrice != null ? `$${Number(item.currentPrice).toFixed(2)}` : '—';

    const gbPriceDiv = document.createElement('div');
    gbPriceDiv.className = cellBaseClass + ' bg-great-buy-one';
    gbPriceDiv.textContent = item.goodBuyPrice;

    const bbPriceDiv = document.createElement('div');
    bbPriceDiv.className = cellBaseClass + ' bg-desperate-buy-one';
    bbPriceDiv.textContent = item.badBuyPrice;

    const dividendDiv = document.createElement('div');
    dividendDiv.className = cellBaseClass + ' bg-secondary-color';
    dividendDiv.textContent = item.dividendYield || '—';

    const folderIcon = document.createElement('button');
    folderIcon.className = cellBaseClass + ' group bg-secondary-color hover:bg-text-color text-text-color transition-colors duration-150';
    folderIcon.title = 'Add to watchlists';
    folderIcon.innerHTML = '<svg class="h-1/2 w-1/2 laptop:h-3/5 laptop:w-3/5 group-hover:text-background" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>';

    const deleteIcon = document.createElement('button');
    deleteIcon.className = 'delete-icon flex justify-center items-center text-center leading-tight px-1 py-1 select-none min-w-0 bg-secondary-color rounded-r hover:bg-text-color transition-colors duration-150';
    deleteIcon.id = "watchlistDeleteButton";
    deleteIcon.innerHTML = '<img class="h-full w-4/5" src="/src/trashcan.svg" alt="Delete">';

    folderIcon.addEventListener('click', function (event) {
        event.stopPropagation();
        openFolderModal(item.ticker);
    });

    nameDiv.addEventListener('click', function (event) {
        // Let the browser handle modified clicks (new tab/window) via the href.
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        watchListContainerLarge.classList.add("fadeAway");
        loadTickerAndNavigate(item.ticker).catch(error => {
            console.error('Error occurred when retrieving stock data: ', error);
        });
    });

    deleteIcon.addEventListener('click', function () {
        openDeleteConfirmModal(item.ticker, async function () {
            const success = await deleteFromFirebase(item.ticker);
            if (!success) {
                alert(`Couldn't delete ${item.ticker} from your watchlist. Please try again.`);
                return;
            }

            // Remove just this row instead of triggering a full watchlist rebuild.
            stockItem.remove();

            let parsedWatchList = [];
            try {
                const watchListItems = localStorage.getItem('userWatchListData');
                parsedWatchList = watchListItems ? JSON.parse(watchListItems) : [];
            } catch (error) {
                console.error('Error parsing cached watchlist: ', error);
            }
            const updatedWatchList = parsedWatchList.filter(watchListItem => watchListItem.ticker !== item.ticker);
            localStorage.setItem('userWatchListData', JSON.stringify(updatedWatchList));
        });
    });

    stockItem.appendChild(nameDiv);
    stockItem.appendChild(priceDiv);
    stockItem.appendChild(gbPriceDiv);
    stockItem.appendChild(bbPriceDiv);
    stockItem.appendChild(dividendDiv);
    stockItem.appendChild(folderIcon);
    stockItem.appendChild(deleteIcon);
    container.appendChild(stockItem);

    return container;
}

// Mobile card version of createStockContainerItem() — same item shape and
// event handlers, laid out as a stacked card instead of a table row. Shows
// price / GB / BB / dividend yield pills.
function createStockCardItem(item) {
    const card = document.createElement('div');
    card.className = 'card flex flex-col gap-3 p-4 hover:cursor-pointer transition duration-150 hover:bg-opacity-30 hover:border-opacity-50';

    const topRow = document.createElement('div');
    topRow.className = 'flex items-start justify-between gap-3';

    const nameCol = document.createElement('div');
    nameCol.className = 'flex flex-col gap-0.5 min-w-0';
    const nameEl = document.createElement('div');
    nameEl.className = 'text-text-color font-semibold text-sm truncate';
    nameEl.textContent = item.name || item.ticker;
    const tickerEl = document.createElement('div');
    tickerEl.className = 'text-text-color text-opacity-60 font-semibold text-xs tracking-wide';
    tickerEl.textContent = item.ticker;
    nameCol.appendChild(nameEl);
    nameCol.appendChild(tickerEl);

    const actionsCol = document.createElement('div');
    actionsCol.className = 'flex items-center gap-2 flex-shrink-0';
    const priceEl = document.createElement('div');
    priceEl.className = 'font-poppins font-bold text-text-color text-lg';
    priceEl.textContent = item.currentPrice != null ? `$${Number(item.currentPrice).toFixed(2)}` : '—';

    const folderBtn = document.createElement('button');
    folderBtn.type = 'button';
    folderBtn.className = 'flex items-center justify-center w-7 h-7 rounded-lg bg-secondary-color text-text-color flex-shrink-0';
    folderBtn.title = 'Add to watchlists';
    folderBtn.innerHTML = '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'flex items-center justify-center w-7 h-7 rounded-lg bg-secondary-color flex-shrink-0';
    deleteBtn.title = 'Remove from watchlist';
    deleteBtn.innerHTML = '<img class="h-3.5 w-3.5" src="/src/trashcan.svg" alt="Delete">';

    actionsCol.appendChild(priceEl);
    actionsCol.appendChild(folderBtn);
    actionsCol.appendChild(deleteBtn);

    topRow.appendChild(nameCol);
    topRow.appendChild(actionsCol);

    const pillRow = document.createElement('div');
    pillRow.className = 'flex gap-2';
    const currentPricePill = document.createElement('div');
    const priceRangeColorClass = getCurrentPriceRangeColorClass(item.currentPrice, item.goodBuyPrice, item.badBuyPrice);
    currentPricePill.className = 'flex-1 text-center rounded-lg py-1.5 text-background text-xs font-bold ' + (priceRangeColorClass || 'bg-white');
    currentPricePill.textContent = item.currentPrice != null ? `$${Number(item.currentPrice).toFixed(2)}` : '—';
    const gbPill = document.createElement('div');
    gbPill.className = 'flex-1 text-center rounded-lg py-1.5 bg-great-buy-one text-background text-xs font-bold';
    gbPill.textContent = 'GB ' + item.goodBuyPrice;
    const bbPill = document.createElement('div');
    bbPill.className = 'flex-1 text-center rounded-lg py-1.5 bg-desperate-buy-one text-background text-xs font-bold';
    bbPill.textContent = 'BB ' + item.badBuyPrice;
    pillRow.appendChild(currentPricePill);
    pillRow.appendChild(gbPill);
    pillRow.appendChild(bbPill);
    const divPill = document.createElement('div');
    divPill.className = 'flex-1 text-center rounded-lg py-1.5 bg-secondary-color text-text-color text-xs font-bold';
    divPill.textContent = 'Div ' + (item.dividendYield || '—');
    pillRow.appendChild(divPill);

    card.appendChild(topRow);
    card.appendChild(pillRow);

    folderBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        openFolderModal(item.ticker);
    });

    deleteBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        openDeleteConfirmModal(item.ticker, async function () {
            const success = await deleteFromFirebase(item.ticker);
            if (!success) {
                alert(`Couldn't delete ${item.ticker} from your watchlist. Please try again.`);
                return;
            }

            card.remove();

            let parsedWatchList = [];
            try {
                const watchListItems = localStorage.getItem('userWatchListData');
                parsedWatchList = watchListItems ? JSON.parse(watchListItems) : [];
            } catch (error) {
                console.error('Error parsing cached watchlist: ', error);
            }
            const updatedWatchList = parsedWatchList.filter(watchListItem => watchListItem.ticker !== item.ticker);
            localStorage.setItem('userWatchListData', JSON.stringify(updatedWatchList));
        });
    });

    card.addEventListener('click', function () {
        watchListContainerLarge.classList.add("fadeAway");
        loadTickerAndNavigate(item.ticker).catch(error => {
            console.error('Error occurred when retrieving stock data: ', error);
        });
    });

    return card;
}

async function deleteFromFirebase(ticker) {
    const user = auth.currentUser;
    if (!user) {
        console.error("No user is signed in.");
        return false;
    }
    try {
        await deleteDoc(doc(db, `users/${user.uid}/watchlist`, ticker));
        return true;
    } catch (error) {
        console.error("Error deleting document: ", error);
        return false;
    }
}

function getStockData(ticker, localStorageItem){
    return new Promise((resolve, reject) => {
        var xhttp = new XMLHttpRequest();
        xhttp.timeout = 15000;
        xhttp.ontimeout = function() {
            reject(new Error(`Timed out fetching stock data for ${ticker}`));
        };

        xhttp.onreadystatechange = function() {
            if (this.readyState == 4) {
                if (this.status == 200) {
                    try {
                        var response = JSON.parse(this.responseText);
                        localStorage.setItem(localStorageItem, JSON.stringify(response));
                        resolve(response);
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    const failure = new Error(`Failed to fetch stock data for ${ticker} (status ${this.status})`);
                    failure.status = this.status;
                    reject(failure);
                }
            }
        };
        xhttp.open("GET", "/run-calculations?ticker=" + encodeURIComponent(ticker), true);
        xhttp.send();
    });
}

// `localStorageItem` is optional — pass it when the result also needs to be
// cached for the next page load (e.g. before navigating to /tickerInfo);
// omit it for bulk/concurrent callers (like a watchlist refresh) so they
// don't all fight over the same shared localStorage key. Either way, the
// calculations are always returned directly.
function runStockCalculations(rawData, ticker, localStorageItem) {

    // A $0 (or otherwise non-positive/non-finite) close is bad data or a
    // delisting artifact. Every ratio in the dip/average math divides by an
    // adjacent close, so a zero produces Infinity/NaN and poisons every
    // band. Drop those months; currentPrice still reports the raw latest.
    const data = rawData.filter((price) => Number.isFinite(price) && price > 0);
    if (data.length === 0) {
        data.push(rawData[0] > 0 ? rawData[0] : 0.01);
    }

    var greatBRLow, greatBRHigh, goodBRLow, goodBRHigh, okayBRLow, okayBRHigh, badBRLow, badBRHigh,
        averageMonthlyChange, priceInMiddleOfDip, monthsInMiddleOfDip;

    averageMonthlyChange = calculateAverageMonthlyChange(data);
    const [recoveryLowMonth, recoveryLowPrice, dropStartMonth, preDropPrice] = findDipInformation(data);
    let min = recoveryLowPrice + (recoveryLowMonth * (averageMonthlyChange * recoveryLowPrice));

    priceInMiddleOfDip = (((3 * recoveryLowPrice) + (preDropPrice)) / 4);
    monthsInMiddleOfDip = (dropStartMonth + recoveryLowMonth) / 2

    let max = ((priceInMiddleOfDip * averageMonthlyChange) * monthsInMiddleOfDip) + priceInMiddleOfDip;

    if (max < min) {
        // The extrapolation can land max below min (e.g. for a stock in
        // genuine decline). Swap so `min` always anchors the cheapest
        // ("great buy") band and `max` the priciest ("bad buy") one.
        [min, max] = [max, min];
    }

    let amountChange = (max - min) / 8;

    greatBRLow = min;
    greatBRHigh = greatBRLow + amountChange;
    goodBRLow = greatBRHigh + amountChange;
    goodBRHigh = goodBRLow + amountChange;
    okayBRLow = goodBRHigh + amountChange;
    okayBRHigh = okayBRLow + amountChange;
    badBRLow = okayBRHigh + amountChange;
    badBRHigh = max;

    var calculations = {
        ticker: ticker,
        greatBRLow: greatBRLow,
        greatBRHigh: greatBRHigh,
        goodBRLow: goodBRLow,
        goodBRHigh: goodBRHigh,
        okayBRLow: okayBRLow,
        okayBRHigh: okayBRHigh,
        badBRLow: badBRLow,
        badBRHigh: badBRHigh,
        dipPrice: recoveryLowPrice,
        currentPrice: rawData[0]
    };

    if (localStorageItem) {
        localStorage.setItem(localStorageItem, JSON.stringify(calculations));
    }

    return calculations;
}

function calculateAverageMonthlyChange(closeData){
    if (closeData.length < 2) {
        return 0;
    }

    let monthlyChange = 0;
    let index = 0;
    for (index; index < closeData.length - 1; index++) {
        monthlyChange += (closeData[index] / closeData[index + 1]);
    }
    monthlyChange /= index; // index === number of month-over-month pairs summed
    monthlyChange -= 1;
    return monthlyChange;
}

function loadCalculatedValues() {
    var storageItem = localStorage.getItem('mostRecentCalculations');
    try {
        if (storageItem) {
            var calculations = JSON.parse(storageItem);

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

function showSpinner(...elements) {
    elements.forEach(el => {
        el.innerHTML = '<span class="spinner" role="status" aria-label="Loading"></span>';
    });
}

function loadDividendInfo(ticker) {
    showSpinner(dividendYieldEl, payoutRatioEl, lastPayoutAmountEl);
    var xhttp = new XMLHttpRequest();
    xhttp.timeout = 15000;
    function showNoDividendData() {
        dividendYieldEl.innerHTML = "N/A";
        payoutRatioEl.innerHTML = "N/A";
        lastPayoutAmountEl.innerHTML = "N/A";
    }
    xhttp.ontimeout = showNoDividendData;
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            try {
                var response = JSON.parse(this.responseText);
                dividendYieldEl.innerHTML = response.dividendYield ?? "N/A";
                payoutRatioEl.innerHTML = response.payoutRatio ?? "N/A";
                lastPayoutAmountEl.innerHTML = response.lastPayoutAmount ?? "N/A";
            } catch (error) {
                showNoDividendData();
            }
        } else if (this.readyState == 4) {
            showNoDividendData();
        }
    };
    xhttp.open("GET", "/run-dividend-info?ticker=" + encodeURIComponent(ticker), true);
    xhttp.send();
}

function formatMarketCap(cap) {
    if (typeof cap !== 'number' || !Number.isFinite(cap)) return "N/A";
    const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"]];
    for (const [size, suffix] of units) {
        if (cap >= size) return "$" + (cap / size).toFixed(2) + suffix;
    }
    return "$" + cap.toLocaleString();
}

function loadCompanyProfile(ticker) {
    showSpinner(marketCapEl, capCategoryEl, sectorEl);
    var xhttp = new XMLHttpRequest();
    xhttp.timeout = 15000;
    function showNoProfileData() {
        marketCapEl.innerHTML = "N/A";
        capCategoryEl.innerHTML = "N/A";
        sectorEl.innerHTML = "N/A";
    }
    xhttp.ontimeout = showNoProfileData;
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            try {
                var response = JSON.parse(this.responseText);
                marketCapEl.textContent = formatMarketCap(response.marketCap);
                capCategoryEl.textContent = response.capCategory ?? "N/A";
                sectorEl.textContent = response.sector ?? "N/A";
            } catch (error) {
                showNoProfileData();
            }
        } else if (this.readyState == 4) {
            showNoProfileData();
        }
    };
    xhttp.open("GET", "/company-profile?ticker=" + encodeURIComponent(ticker), true);
    xhttp.send();
}

function assignValueOnScreen(id, value){
    if (typeof value === 'number' && Number.isFinite(value)) {
        document.getElementById(id).innerHTML = "$" + value.toFixed(2);
    } else {
        console.error(`Value for ${id} is not a finite number:`, value);
        document.getElementById(id).innerHTML = "N/A";
    }
}

// Mobile buy-range chips show a single "$low–$high" string per zone instead
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


function findDipInformation(closeData){

    let monthScoreMonthlyChange = DIP_SCORE_DECAY_PER_MONTH,
        highestScore = 0,
        threshHoldValue = INITIAL_DIP_THRESHOLD,
        recoveryLowMonth,
        recoveryLowPrice,
        dropStartMonth, preDropPrice,
        thresHoldChanged = 0;

    // Lower the threshold in steps until a dip clears it. The threshold is
    // checked *before* calling performDipLoop() so it never runs at a
    // non-positive threshold — a threshold at or below zero would treat
    // ordinary noise (or even a rising stock) as a "dip".
    while (threshHoldValue > 0 && performDipLoop() === 0){
        threshHoldValue -= DIP_THRESHOLD_STEP;
        thresHoldChanged = 1;
    }

    if (highestScore === 0) {
        // No month cleared even the lowest positive threshold — fall back to
        // the single largest decline in the data instead of returning nothing.
        threshHoldValue = -Infinity;
        performDipLoop();
        thresHoldChanged = 1;
    }

    toggleWarning(thresHoldChanged === 1 ? 'threshold' : 'none');

    return( [recoveryLowMonth, recoveryLowPrice, dropStartMonth, preDropPrice] );

    function performDipLoop(){
        // Reset each call: without this, repeated threshold-lowering passes
        // (and the final unconditional fallback pass) inherit decay left
        // over from every prior full scan of closeData, eventually driving
        // every candidate's score permanently negative for low-volatility
        // tickers that never clear the higher thresholds — leaving
        // recoveryLowMonth/recoveryLowPrice/etc. unset entirely.
        let monthScore = 1;
        for (let index = 0; index < closeData.length - 1; index++) {
            monthScore -= monthScoreMonthlyChange; //Adjust monthly score per month
            let changeRatio = 1 - (closeData[index] / closeData[index + 1]);

            if(changeRatio > threshHoldValue){ // If the drop in a month exceeds the threshold, go 12 months in the future and find where it bottoms out
                let localLowestPrice = closeData[index],
                    localLowestMonth = index - 1,
                    secondaryMonthScore = monthScore,
                    localDipHolder = index,
                    localDipHolderPrice = index > 0 ? closeData[index - 1] : closeData[index];

                    for (let lowestPointIndex = index; lowestPointIndex > index - 12 && lowestPointIndex >= 0; lowestPointIndex--) {  //Move 12 months in the future to find where it bottoms out
                        secondaryMonthScore += monthScoreMonthlyChange;
                        if(closeData[lowestPointIndex] < localLowestPrice){
                            localLowestPrice = closeData[lowestPointIndex];
                            localLowestMonth = lowestPointIndex - 1;
                        }
                    }
                let weightedChange = 2 * changeRatio;
                if(calculateScore(secondaryMonthScore, weightedChange) > highestScore){
                    highestScore = calculateScore(secondaryMonthScore, weightedChange);
                    recoveryLowMonth = localLowestMonth;
                    recoveryLowPrice = localLowestPrice;
                    dropStartMonth = localDipHolder;
                    preDropPrice = localDipHolderPrice;
                }

            }
        }
        return highestScore;
    }
}

function toggleWarning(warningType){
    if(warningType === 'threshold'){
        localStorage.setItem('recentlyCalculatedWarning', JSON.stringify('threshold'));
    } else{
        localStorage.setItem('recentlyCalculatedWarning', JSON.stringify('none'));
    }

}

function activeWarningOnScreen(){
    var warning = localStorage.getItem('recentlyCalculatedWarning');
    var data = null;
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

function calculateScore(monthlyScore, changeRatio){
    return monthlyScore + changeRatio;
}

const CHART_RANGE_OPTIONS = [
    { label: '1Y', months: 12 },
    { label: '5Y', months: 60 },
    { label: '10Y', months: 120 },
    { label: 'All', months: 'all' },
];

function initChartRangeButtons(onRangeChange) {
    if (!chartRangeButtons) return;
    chartRangeButtons.innerHTML = '';

    const activeClasses = ['bg-text-color', 'text-background'];
    const inactiveClasses = ['bg-secondary-color', 'text-text-color'];

    CHART_RANGE_OPTIONS.forEach((option) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = option.label;
        btn.className = 'px-3 py-1 rounded-lg text-sm laptop:text-base desktopXL:text-xl font-medium transition-all duration-150 ease-in-out hover:-translate-y-0.5 active:scale-95';
        btn.classList.add(...(option.months === 'all' ? activeClasses : inactiveClasses));

        btn.addEventListener('click', function() {
            chartRangeButtons.querySelectorAll('button').forEach((b) => {
                b.classList.remove(...activeClasses);
                b.classList.add(...inactiveClasses);
            });
            btn.classList.remove(...inactiveClasses);
            btn.classList.add(...activeClasses);
            onRangeChange(option.months);
        });

        chartRangeButtons.appendChild(btn);
    });
}

function createStockChart(stockData) {
    var ctx = document.getElementById('stockChart').getContext('2d');

    // Chart reads oldest -> newest, left to right. Work on copies so the
    // cached mostRecentData (still most-recent-first) is left untouched.
    let chronoPrices = [...stockData.prices].reverse();
    let chronoDates = Array.isArray(stockData.dates) ? [...stockData.dates].reverse() : [];

    // Defensive fallback for any stale cached payload that predates real dates.
    if (chronoDates.length !== chronoPrices.length) {
        let today = new Date();
        chronoDates = chronoPrices.map((_, i) => {
            let monthsAgo = chronoPrices.length - 1 - i;
            return new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1).toLocaleDateString();
        });
    }

    function sliceForRange(months) {
        if (months === 'all') {
            return { prices: chronoPrices, dates: chronoDates };
        }
        return { prices: chronoPrices.slice(-months), dates: chronoDates.slice(-months) };
    }

    function colorsForPrices(rangePrices) {
        let rising = rangePrices.length < 2 || rangePrices[rangePrices.length - 1] >= rangePrices[0];
        return rising
            ? { line: 'rgb(3, 172, 19)', fill: 'rgba(3, 172, 19, 0.2)' }
            : { line: 'rgb(255, 99, 132)', fill: 'rgba(255, 99, 132, 0.2)' };
    }

    let initialRange = sliceForRange('all');
    let initialColors = colorsForPrices(initialRange.prices);

    const crosshairPlugin = {
        id: 'stockChartCrosshair',
        afterDatasetsDraw(chart) {
            let active = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
            if (!active || !active.length) return;
            let chartCtx = chart.ctx;
            let x = active[0].element.x;
            let area = chart.chartArea;
            chartCtx.save();
            chartCtx.beginPath();
            chartCtx.moveTo(x, area.top);
            chartCtx.lineTo(x, area.bottom);
            chartCtx.lineWidth = 1;
            chartCtx.setLineDash([4, 4]);
            chartCtx.strokeStyle = 'rgba(228, 236, 228, 0.4)';
            chartCtx.stroke();
            chartCtx.restore();
        }
    };

    var stockChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: initialRange.dates,
            datasets: [{
                label: 'Stock Price',
                data: initialRange.prices,
                borderColor: initialColors.line,
                backgroundColor: initialColors.fill,
                borderWidth: 1.5,
                fill: true,
                tension: 0.15,
                pointRadius: 0,
                pointHitRadius: 8,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: initialColors.line,
                pointHoverBorderColor: '#E4ECE4',
                pointHoverBorderWidth: 1,
            }]
        },
        plugins: [crosshairPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index', // Track the nearest point along the x-axis no matter the cursor's exact y
                intersect: false,
                axis: 'x',
            },
            scales: {
                x: {
                    grid: {
                        display: displayTicks(), // Decluttered on mobile: no gridlines either
                    },
                    ticks: {
                        display: displayTicks(), // Display ticks conditionally
                        maxTicksLimit: getMaxTicksLimit(), // Maximum number of ticks dynamically
                        callback: function(value, index, ticks) {
                            let screenWidth = window.innerWidth;
                            if (screenWidth < 640) {
                                return (index % 2 === 0) ? this.getLabelForValue(value) : '';
                            }
                            return this.getLabelForValue(value);
                        },
                        font: {
                            size: getFontSize(),
                        },
                        maxRotation: 90,
                        minRotation: 90,
                    },
                    title: {
                        display: false,
                        text: 'Date',
                        font: {
                            size: getFontSize(),
                        }
                    }
                },
                y: {
                    position: 'right', // Position y-axis on the right side
                    grid: {
                        display: displayTicks(),
                    },
                    ticks: {
                        maxTicksLimit: getMaxTicksLimit(), // Maximum number of ticks dynamically
                        callback: function(value, index, ticks) {
                            let screenWidth = window.innerWidth;
                            if (screenWidth < 640) {
                                return (index % 2 === 0) ? this.getLabelForValue(value) : '';
                            }
                            return '$' + value;
                        },
                        font: {
                            size: getFontSize(),
                        }
                    },
                    title: {
                        display: true,
                        text: 'Stock Price',
                        font: {
                            size: getFontSize(),
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1c2320',
                    titleColor: '#E4ECE4',
                    bodyColor: '#E4ECE4',
                    borderColor: '#425C52',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        title: function(items) {
                            return items.length ? items[0].label : '';
                        },
                        label: function(item) {
                            return '$' + Number(item.parsed.y).toFixed(2);
                        }
                    }
                }
            }
        }
    });

    function applyRange(months) {
        let range = sliceForRange(months);
        let colors = colorsForPrices(range.prices);
        stockChart.data.labels = range.dates;
        stockChart.data.datasets[0].data = range.prices;
        stockChart.data.datasets[0].borderColor = colors.line;
        stockChart.data.datasets[0].backgroundColor = colors.fill;
        stockChart.data.datasets[0].pointHoverBackgroundColor = colors.line;
        stockChart.update();
    }

    initChartRangeButtons(applyRange);

    // Adjust canvas size dynamically
    window.addEventListener('resize', function() {
        stockChart.options.scales.x.ticks.maxTicksLimit = getMaxTicksLimit();
        stockChart.options.scales.x.ticks.display = displayTicks(); // Update displayTicks on resize
        stockChart.options.scales.x.grid.display = displayTicks();
        stockChart.options.scales.y.grid.display = displayTicks();
        stockChart.resize();
    });

    function displayTicks() {
        let screenWidth = window.innerWidth;
        return screenWidth >= 640; // Display ticks only if screen width is 640px or larger
    }

    function getMaxTicksLimit() {
        let screenWidth = window.innerWidth;
        if (screenWidth < 640) {
            return 0; // smaller than tablet
        } else if (screenWidth < 1024) {
            return 0; // tablet
        } else if (screenWidth < 1600) {
            return 20; // laptop
        } else if (screenWidth < 1921) {
            return 30; // desktop
        } else {
            return 40; // desktopXL
        }
    }
    function getFontSize() {
        let screenWidth = window.innerWidth;
        if (screenWidth < 767) {
            return 10; // smaller than tablet
        } else if (screenWidth < 1024) {
            return 12; // tablet
        } else if (screenWidth < 1600) {
            return 11; // laptop
        } else if (screenWidth < 1921) {
            return 16; // desktop
        } else {
            return 20; // desktopXL
        }
    }
}
