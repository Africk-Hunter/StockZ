/* Main page: the ticker search box, plus the mobile-only watchlist quick-access list. */
import { sanitizeTicker } from '../lib/ticker.mjs';
import { formatPrice } from '../lib/format.mjs';
import { getCachedWatchList } from '../lib/storage.mjs';
import { loadTickerAndNavigate, navigateToTicker, nextTickerRequestId, isLatestTickerRequest } from '../lib/stock-service.mjs';

const tickerParentBox       = document.getElementById("tickerParentBox");
const mainTickerInput       = document.getElementById("mainTickerInput");
const tickerSubmitBtn       = document.getElementById("tickerSubmitBtn");

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
    priceEl.textContent = formatPrice(item.currentPrice);

    row.appendChild(left);
    row.appendChild(priceEl);

    row.addEventListener('click', function () {
        document.querySelector('main').classList.add('fadeAway');
        navigateToTicker(item.ticker);
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

    const requestId = nextTickerRequestId();
    loadTickerAndNavigate(ticker, requestId).catch(error => {
        console.error('Error occurred when retrieving stock data: ', error);
        if (isLatestTickerRequest(requestId)) {
            tickerSubmitBtn.style.display = 'flex';
            mainTickerInput.classList.remove("sizeText");
            tickerParentBox.classList.remove("moveUpBox");
            mainTickerInput.classList.add('invalid-ticker');
        }
    });
}
