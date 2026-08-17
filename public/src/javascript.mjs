import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { getFirestore, collection, setDoc, getDocs, doc, deleteDoc, updateDoc, writeBatch, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

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

// User-facing "Report a Problem" button + modal, injected on every page
// (the script is loaded everywhere) so it works regardless of what's
// broken elsewhere on the page. Submits the description plus recent
// captured errors to the same /log-error function.
function initBugReportWidget() {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'fixed bottom-20 right-4 laptop:bottom-6 laptop:right-6 z-20 flex items-center justify-center w-10 h-10 laptop:w-12 laptop:h-12 rounded-full bg-secondary-color text-text-color shadow-lg hover:bg-accent-color hover:text-background transition-colors duration-150';
    trigger.title = 'Report a problem';
    trigger.setAttribute('aria-label', 'Report a problem');
    trigger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5 laptop:w-6 laptop:h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>';

    const overlay = document.createElement('div');
    overlay.className = 'hidden fixed inset-0 bg-black bg-opacity-50 z-30 flex items-center justify-center px-4';
    overlay.innerHTML = `
        <div class="flex flex-col bg-background border border-text-color border-opacity-25 rounded-lg w-full max-w-xs laptop:max-w-md p-4 laptop:p-6 gap-3 text-text-color">
            <div class="flex justify-between items-center">
                <h2 class="text-base laptop:text-xl font-semibold">Report a Problem</h2>
                <button type="button" data-bug-report-close class="text-text-color text-2xl leading-none hover:text-accent-color flex-shrink-0">&times;</button>
            </div>
            <p class="text-xs laptop:text-sm text-text-color text-opacity-70">Tell me what happened — recent technical details from your session will be included automatically so I can look into it.</p>
            <textarea data-bug-report-description rows="4" maxlength="1000" placeholder="What were you doing when something went wrong? (optional)" class="w-full bg-secondary-color bg-opacity-30 rounded px-2 py-2 text-text-color placeholder-text-color placeholder-opacity-50 outline-none text-sm resize-none"></textarea>
            <div data-bug-report-status class="text-xs laptop:text-sm hidden"></div>
            <div class="flex justify-end gap-2">
                <button type="button" data-bug-report-cancel class="px-3 py-1.5 rounded text-sm laptop:text-base text-text-color text-opacity-70 hover:text-opacity-100">Cancel</button>
                <button type="button" data-bug-report-send class="px-3 py-1.5 rounded bg-accent-color text-background font-semibold text-sm laptop:text-base hover:opacity-90">Send Report</button>
            </div>
        </div>
    `;

    document.body.appendChild(trigger);
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

    trigger.addEventListener('click', () => overlay.classList.remove('hidden'));
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
let currentSortKey          = null;
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
let currentFolderId         = null;
let currentModalTicker      = null;

auth.onAuthStateChanged((user) => {
    if (user) {
        if (watchlistItemsContainer) {
            initWatchlistFolders(user);
            runWatchlist(user);
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
    row.className = 'flex items-center justify-between gap-3 bg-secondary-color bg-opacity-20 border border-text-color border-opacity-25 rounded-lg px-4 py-3 hover:cursor-pointer';

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
    window.location.href = ('/tickerInfo');
}

/* Ticker Info Page */
if (tickerLabelIP) {
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
            addToWatchlist.disabled = true;
            const success = await deleteFromFirebase(tickerToAdd);
            addToWatchlist.disabled = false;
            if (!success) {
                alert(`Couldn't remove ${tickerToAdd} from your watchlist. Please try again.`);
                return;
            }
            const updatedWatchList = getCachedWatchList().filter(item => item.ticker !== tickerToAdd);
            localStorage.setItem('userWatchListData', JSON.stringify(updatedWatchList));
            setAddToWatchlistButtonState(false);
            return;
        }

        fetchStockInfo(tickerToAdd)
            .then((info) => {
                addToWatchlistFunc(tickerToAdd, grBLonPage.textContent, bBHonPage.textContent, user.uid, info);
                setAddToWatchlistButtonState(true);
            })
            .catch((error) => {
                console.error('Error fetching stock info: ', error);
                addToWatchlistFunc(tickerToAdd, grBLonPage.textContent, bBHonPage.textContent, user.uid, {});
                setAddToWatchlistButtonState(true);
            });
    });
}

function isTickerInWatchlist(ticker) {
    return getCachedWatchList().some(item => item.ticker === ticker);
}

function setAddToWatchlistButtonState(inWatchlist) {
    if (!addToWatchlist) return;
    addToWatchlist.textContent = inWatchlist ? 'Remove from Watchlist' : 'Add To Watchlist';
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
                    reject(new Error('Failed to fetch stock info for ' + ticker));
                }
            }
        };
        xhttp.open("GET", "/stock-info?ticker=" + encodeURIComponent(ticker), true);
        xhttp.send();
    });
}

async function addToWatchlistFunc(ticker, goodBuyPrice, badBuyPrice, uid, info = {}) {
    const safeTicker = sanitizeTicker(ticker);
    if (!safeTicker) {
        console.error('Refusing to write an invalid ticker to Firestore:', ticker);
        return;
    }
    const userDocRef = doc(db, `users/${uid}/watchlist`, safeTicker);
    const watchlistEntry = {
        ticker: safeTicker,
        goodBuyPrice: goodBuyPrice,
        badBuyPrice: badBuyPrice,
        name: info.name || null,
        currentPrice: info.currentPrice ?? null,
        dividendYield: info.dividendYield || null,
        folderIds: []
    };
    try {
        await setDoc(userDocRef, watchlistEntry);

        let parsedWatchList = [];
        try {
            const watchListItems = localStorage.getItem('userWatchListData');
            parsedWatchList = watchListItems ? JSON.parse(watchListItems) : [];
        } catch (error) {
            console.error('Error parsing cached watchlist: ', error);
        }

        const exists = parsedWatchList.some(item => item.ticker === safeTicker);

        if (!exists) {
            parsedWatchList.push(watchlistEntry);
            localStorage.setItem('userWatchListData', JSON.stringify(parsedWatchList));
        } else {
            console.log(`Ticker ${safeTicker} is already in the watchlist.`);
        }
    } catch (e) {
        console.error("Error adding document: ", e);
    }
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
                const [, folders] = await Promise.all([
                    updateWatchListValues(user),
                    fetchWatchlistFolders(user.uid)
                ]);
                localStorage.setItem('userWatchlistFolders', JSON.stringify(folders));
                renderFolderDropdown(folders);
            } finally {
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

    folderDropdownBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        folderDropdownPanel.classList.toggle('hidden');
    });
    document.addEventListener('click', function (event) {
        if (!folderDropdownWrapper.contains(event.target)) {
            folderDropdownPanel.classList.add('hidden');
        }
    });

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
        await toggleTickerFolder(user.uid, currentModalTicker, folder.id, true);
        folderModalNewFolderInput.value = '';
        renderFolderModalList();
        renderFolderDropdown(getCachedFolders());
    });
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

    const updateOne = async (item) => {
        let updatedItem = {
            ticker: item.ticker,
            goodBuyPrice: item.goodBuyPrice,
            badBuyPrice: item.badBuyPrice,
            name: item.name || null,
            currentPrice: item.currentPrice ?? null,
            dividendYield: item.dividendYield ?? null,
            folderIds: Array.isArray(item.folderIds) ? item.folderIds : []
        };
        try {
            const data = await getStockData(item.ticker, 'mostRecentData');
            const calculations = runStockCalculations(data.prices, item.ticker);

            let info = {};
            try {
                info = await fetchStockInfo(item.ticker);
            } catch (error) {
                console.error(`Error fetching stock info for ${item.ticker}: `, error);
            }

            updatedItem = {
                ticker: item.ticker,
                goodBuyPrice: calculations.goodBRLow.toFixed(2),
                badBuyPrice: calculations.badBRHigh.toFixed(2),
                name: info.name || item.name || null,
                currentPrice: info.currentPrice ?? item.currentPrice ?? null,
                dividendYield: info.dividendYield ?? item.dividendYield ?? null,
                folderIds: Array.isArray(item.folderIds) ? item.folderIds : []
            };
        } catch (error) {
            console.error(`Error refreshing ${item.ticker}: `, error);
        }
        return updatedItem;
    };

    // Cap concurrency (instead of firing every item's requests at once) and
    // batch the Firestore writes into one round trip instead of N.
    const updatedWatchlistItems = await mapWithConcurrencyLimit(watchlistItems, 4, updateOne);

    const batch = writeBatch(db);
    updatedWatchlistItems.forEach((updatedItem) => {
        const userDocRef = doc(db, `users/${user.uid}/watchlist`, updatedItem.ticker);
        batch.update(userDocRef, {
            goodBuyPrice: updatedItem.goodBuyPrice,
            badBuyPrice: updatedItem.badBuyPrice,
            name: updatedItem.name,
            currentPrice: updatedItem.currentPrice,
            dividendYield: updatedItem.dividendYield
        });
    });
    await batch.commit();

    localStorage.setItem('userWatchListData', JSON.stringify(updatedWatchlistItems));
    runWatchlist(user);
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
            const comparison = compareWatchlistValues(a[currentSortKey], b[currentSortKey], currentSortKey);
            return currentSortDirection === 'asc' ? comparison : -comparison;
        });
    }

    updateWatchlistUI(visibleWatchList);
    updateSortIndicators();
}

function sortWatchlist(key) {
    if (currentSortKey === key) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortKey = key;
        currentSortDirection = 'asc';
    }
    runWatchlist(auth.currentUser);
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
        el.textContent = key === currentSortKey ? (currentSortDirection === 'asc' ? '▲' : '▼') : '';
    });
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
        alert("Couldn't save the new folder to your account. Please try again.");
        return null;
    }
    const folders = getCachedFolders();
    folders.push(folder);
    localStorage.setItem('userWatchlistFolders', JSON.stringify(folders));
    return folder;
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
        alert("Couldn't delete the folder. Please try again.");
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

async function toggleTickerFolder(uid, ticker, folderId, isChecked) {
    const itemRef = doc(db, `users/${uid}/watchlist`, ticker);
    try {
        await updateDoc(itemRef, {
            folderIds: isChecked ? arrayUnion(folderId) : arrayRemove(folderId)
        });
    } catch (e) {
        console.error("Error updating ticker folders: ", e);
        alert("Couldn't update folders for this stock. Please try again.");
        return false;
    }

    const watchList = getCachedWatchList().map((item) => {
        if (item.ticker !== ticker) return item;
        const currentIds = Array.isArray(item.folderIds) ? item.folderIds : [];
        const updatedIds = isChecked
            ? Array.from(new Set([...currentIds, folderId]))
            : currentIds.filter(id => id !== folderId);
        return { ...item, folderIds: updatedIds };
    });
    localStorage.setItem('userWatchListData', JSON.stringify(watchList));
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

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'flex-shrink-0 opacity-40 hover:opacity-100 hover:text-desperate-buy-one px-1';
        deleteBtn.textContent = '✕';
        deleteBtn.title = `Delete folder "${folder.name}"`;
        deleteBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const user = auth.currentUser;
            if (!user) return;
            if (confirm(`Delete folder "${folder.name}"? Stocks will stay in your watchlist.`)) {
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
    newFolderInput.placeholder = 'New folder';
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

function openFolderModal(ticker) {
    const user = auth.currentUser;
    if (!user) {
        console.error("No user is signed in.");
        return;
    }
    currentModalTicker = ticker;
    folderModalTitle.textContent = `Add ${ticker} to Folders`;
    renderFolderModalList();
    folderModalOverlay.classList.remove('hidden');
}

function closeFolderModal() {
    folderModalOverlay.classList.add('hidden');
    currentModalTicker = null;
}

function renderFolderModalList() {
    folderModalList.innerHTML = '';
    const folders = getCachedFolders();
    const item = getCachedWatchList().find(watchListItem => watchListItem.ticker === currentModalTicker);
    const itemFolderIds = (item && Array.isArray(item.folderIds)) ? item.folderIds : [];

    if (folders.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-text-color text-opacity-60 text-sm text-center py-2';
        empty.textContent = 'No folders yet. Create one below.';
        folderModalList.appendChild(empty);
        return;
    }

    folders.forEach((folder) => {
        const row = document.createElement('label');
        row.className = 'flex items-center gap-2 px-2 py-2 rounded hover:bg-secondary-color cursor-pointer';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'accent-accent-color w-4 h-4 laptop:w-5 laptop:h-5 flex-shrink-0';
        checkbox.checked = itemFolderIds.includes(folder.id);
        checkbox.addEventListener('change', async () => {
            const user = auth.currentUser;
            if (!user || !currentModalTicker) return;
            const desiredState = checkbox.checked;
            const success = await toggleTickerFolder(user.uid, currentModalTicker, folder.id, desiredState);
            if (!success) {
                checkbox.checked = !desiredState;
                return;
            }
            renderFolderDropdown(getCachedFolders());
            if (folder.id === currentFolderId) {
                runWatchlist(user);
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
        setTimeout(() => {
            stockContainer.classList.add('fade-in-slow');
            stockCard.classList.add('fade-in-slow');
        }, index * 75);

        watchlistItemsContainer.appendChild(stockContainer);
        watchlistCardsContainer.appendChild(stockCard);
    });
}

function createEmptyWatchlistCard() {
    const card = document.createElement('div');
    card.className = 'flex flex-col items-center gap-2 bg-secondary-color bg-opacity-20 border border-text-color border-opacity-25 rounded-lg p-6 text-center';

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


function createStockContainerItem(item) {
    const container = document.createElement('div');
    container.className = 'stock-container';
    container.style.opacity = 0;

    const stockItem = document.createElement('div');
    // Column widths (grid-cols) must stay in sync with the header row template in watchlist.html, or header/row columns drift out of alignment
    stockItem.className = 'stock-item grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1.75rem_1.75rem] laptop:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_2.5rem_2.5rem] w-full items-stretch min-h-7 laptop:min-h-9 text-background text-[10px] laptop:text-base desktop:text-lg desktopXL:text-xl select-none font-semibold';

    const cellBaseClass = 'flex justify-center items-center text-center leading-tight px-1 py-1 select-none min-w-0 border-r border-background';

    const nameDiv = document.createElement('div');
    nameDiv.className = cellBaseClass + ' bg-text-color rounded-l hover:cursor-pointer';
    nameDiv.textContent = item.name ? `${item.name} (${item.ticker})` : item.ticker;
    nameDiv.title = nameDiv.textContent;

    const priceDiv = document.createElement('div');
    priceDiv.className = cellBaseClass + ' bg-secondary-color';
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
    folderIcon.title = 'Add to folders';
    folderIcon.innerHTML = '<svg class="h-1/2 w-1/2 laptop:h-3/5 laptop:w-3/5 group-hover:text-background" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>';

    const deleteIcon = document.createElement('button');
    deleteIcon.className = 'delete-icon flex justify-center items-center text-center leading-tight px-1 py-1 select-none min-w-0 bg-secondary-color rounded-r hover:bg-text-color transition-colors duration-150';
    deleteIcon.id = "watchlistDeleteButton";
    deleteIcon.innerHTML = '<img class="h-full w-4/5" src="/src/trashcan.svg" alt="Delete">';

    folderIcon.addEventListener('click', function (event) {
        event.stopPropagation();
        openFolderModal(item.ticker);
    });

    nameDiv.addEventListener('click', function () {
        watchListContainerLarge.classList.add("fadeAway");
        loadTickerAndNavigate(item.ticker).catch(error => {
            console.error('Error occurred when retrieving stock data: ', error);
        });
    });

    deleteIcon.addEventListener('click', async function () {
        deleteIcon.disabled = true;
        const success = await deleteFromFirebase(item.ticker);
        if (!success) {
            deleteIcon.disabled = false;
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
// price / GB / BB only (no dividend pill) per product direction.
function createStockCardItem(item) {
    const card = document.createElement('div');
    card.className = 'flex flex-col gap-3 bg-secondary-color bg-opacity-20 border border-text-color border-opacity-25 rounded-lg p-4 hover:cursor-pointer';

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
    folderBtn.className = 'flex items-center justify-center w-7 h-7 rounded-md bg-secondary-color text-text-color flex-shrink-0';
    folderBtn.title = 'Add to folders';
    folderBtn.innerHTML = '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'flex items-center justify-center w-7 h-7 rounded-md bg-secondary-color flex-shrink-0';
    deleteBtn.title = 'Remove from watchlist';
    deleteBtn.innerHTML = '<img class="h-3.5 w-3.5" src="/src/trashcan.svg" alt="Delete">';

    actionsCol.appendChild(priceEl);
    actionsCol.appendChild(folderBtn);
    actionsCol.appendChild(deleteBtn);

    topRow.appendChild(nameCol);
    topRow.appendChild(actionsCol);

    const pillRow = document.createElement('div');
    pillRow.className = 'flex gap-2';
    const gbPill = document.createElement('div');
    gbPill.className = 'flex-1 text-center rounded-md py-1.5 bg-great-buy-one text-background text-xs font-bold';
    gbPill.textContent = 'GB ' + item.goodBuyPrice;
    const bbPill = document.createElement('div');
    bbPill.className = 'flex-1 text-center rounded-md py-1.5 bg-desperate-buy-one text-background text-xs font-bold';
    bbPill.textContent = 'BB ' + item.badBuyPrice;
    pillRow.appendChild(gbPill);
    pillRow.appendChild(bbPill);

    card.appendChild(topRow);
    card.appendChild(pillRow);

    folderBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        openFolderModal(item.ticker);
    });

    deleteBtn.addEventListener('click', async function (event) {
        event.stopPropagation();
        deleteBtn.disabled = true;
        const success = await deleteFromFirebase(item.ticker);
        if (!success) {
            deleteBtn.disabled = false;
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
                    reject(new Error(`Failed to fetch stock data for ${ticker} (status ${this.status})`));
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
function runStockCalculations(data, ticker, localStorageItem) {

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
        currentPrice: data[0]
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

function loadDividendInfo(ticker) {
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
        btn.className = 'px-3 py-1 rounded desktopXL:rounded-lg text-sm laptop:text-md desktopXL:text-xl font-medium transition-all duration-150 ease-in-out hover:-translate-y-0.5';
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
