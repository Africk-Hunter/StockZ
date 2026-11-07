/* Main page: the ticker search box, plus the mobile-only watchlist quick-access list. */
import { sanitizeTicker } from '../lib/ticker.mjs';
import { formatPrice } from '../lib/format.mjs';
import { getCachedWatchList } from '../lib/storage.mjs';
import { loadTickerAndNavigate, navigateToTicker, nextTickerRequestId, isLatestTickerRequest } from '../lib/stock-service.mjs';

const tickerParentBox       = document.getElementById("tickerParentBox");
const mainTickerInput       = document.getElementById("mainTickerInput");
const tickerSubmitBtn       = document.getElementById("tickerSubmitBtn");

// Invalid state: ember text on the input plus a sentence saying what is wrong.
function setInvalid(on) {
    mainTickerInput.classList.toggle('invalid-ticker', on);
    const message = document.getElementById('tickerError');
    if (message) message.classList.toggle('hidden', !on);
}

if (tickerParentBox) {
    renderMobileSearchSuggestions();
    mainTickerInput.addEventListener('input', function(){
        setInvalid(false);
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
    row.className = 'group tile-group cut-sm cursor-pointer';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');

    const left = document.createElement('div');
    left.className = 'flex flex-col gap-1 min-w-0 flex-1 bg-canopy px-4 py-3 transition-[background-color,color] duration-hover group-hover:bg-cream group-hover:text-ink';
    const symbolEl = document.createElement('div');
    symbolEl.className = 'caps text-small tracking-caps-label';
    symbolEl.textContent = item.ticker;
    const nameEl = document.createElement('div');
    nameEl.className = 'text-small truncate text-sand';
    nameEl.textContent = item.name || '';
    left.appendChild(symbolEl);
    left.appendChild(nameEl);

    const priceEl = document.createElement('div');
    priceEl.className = 'value-tile w-28 flex-shrink-0 text-small';
    priceEl.textContent = formatPrice(item.currentPrice);

    row.appendChild(left);
    row.appendChild(priceEl);

    const open = function () {
        document.querySelector('main').classList.add('fadeAway');
        navigateToTicker(item.ticker);
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
        }
    });

    return row;
}

function tickerSubmit(){
    const ticker = sanitizeTicker(mainTickerInput.value);
    if (!ticker) {
        setInvalid(true);
        return;
    }
    tickerSubmitBtn.style.display = 'none';
    mainTickerInput.classList.add("sizeText");
    tickerParentBox.classList.add("moveUpBox");

    const requestId = nextTickerRequestId();
    loadTickerAndNavigate(ticker, requestId).catch(error => {
        console.error('Error occurred when retrieving stock data: ', error);
        if (isLatestTickerRequest(requestId)) {
            tickerSubmitBtn.style.display = 'flex';
            mainTickerInput.classList.remove("sizeText");
            tickerParentBox.classList.remove("moveUpBox");
            setInvalid(true);
        }
    });
}
