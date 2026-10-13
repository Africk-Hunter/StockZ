/* DOM builders for the watchlist: desktop table rows, mobile cards, and the
   in-place update used by progressive refresh. */
import { tickerPath } from '../lib/ticker.mjs';
import { formatPrice } from '../lib/format.mjs';
import { getCurrentPriceRangeColorClass } from '../lib/watchlist-logic.mjs';
import { navigateToTicker } from '../lib/stock-service.mjs';
import { getCachedWatchList, setCachedWatchList } from '../lib/storage.mjs';
import { deleteFromFirebase } from '../lib/watchlist-repo.mjs';
import { openFolderModal } from './folders.mjs';
import { openDeleteConfirmModal } from './delete-modal.mjs';

const watchListContainerLarge = document.getElementById("watchListContainerLarge");

export function updateWatchlistUI(watchListItems) {
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
export function updateWatchlistRowInPlace(item) {
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

// Asks for confirmation, then deletes the ticker from Firestore, removes the
// given row element and drops the ticker from the cache — without
// triggering a full watchlist rebuild.
function confirmAndDeleteItem(item, rowElement) {
    openDeleteConfirmModal(item.ticker, async function () {
        const success = await deleteFromFirebase(item.ticker);
        if (!success) {
            alert(`Couldn't delete ${item.ticker} from your watchlist. Please try again.`);
            return;
        }

        rowElement.remove();
        setCachedWatchList(getCachedWatchList().filter(watchListItem => watchListItem.ticker !== item.ticker));
    });
}

function openTickerFromList(ticker) {
    watchListContainerLarge.classList.add("fadeAway");
    navigateToTicker(ticker);
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
    priceDiv.textContent = formatPrice(item.currentPrice);

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
        openTickerFromList(item.ticker);
    });

    deleteIcon.addEventListener('click', function () {
        confirmAndDeleteItem(item, stockItem);
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
    priceEl.textContent = formatPrice(item.currentPrice);

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
    currentPricePill.textContent = formatPrice(item.currentPrice);
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
        confirmAndDeleteItem(item, card);
    });

    card.addEventListener('click', function () {
        openTickerFromList(item.ticker);
    });

    return card;
}
