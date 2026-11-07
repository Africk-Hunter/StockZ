/* DOM builders for the watchlist: desktop table rows, mobile cards, and the
   in-place update used by progressive refresh. */
import { tickerPath } from '../lib/ticker.mjs';
import { formatPrice } from '../lib/format.mjs';
import { getCurrentPriceRangeColorClass, getBuyTierLabel, isLifetimeNegative } from '../lib/watchlist-logic.mjs';
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
    card.className = 'flex flex-col items-center gap-4 bg-floor cut-md p-6 text-center';

    const label = document.createElement('div');
    label.className = 'label-tile cut-sm';
    label.textContent = 'Nothing here';

    const message = document.createElement('div');
    message.className = 'text-body';
    message.textContent = 'No stocks yet';

    const cta = document.createElement('a');
    cta.href = '/main';
    cta.className = 'btn';
    cta.textContent = 'Search for a ticker';

    card.appendChild(label);
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

const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true"';
const FOLDER_SVG = `<svg class="h-[18px] w-[18px]" ${ICON_ATTRS}><path d="M3 5h7l2 3h9v12H3z"/></svg>`;
const TRASH_SVG = `<svg class="h-[18px] w-[18px]" ${ICON_ATTRS}><path d="M4 7h16M9 7V4h6v3M6 7v13h12V7M10 11v6M14 11v6"/></svg>`;
const ICON_CELL = 'flex min-w-0 items-center justify-center bg-canopy text-cream transition-[background-color,color] duration-hover hover:bg-cream hover:text-ink';

function createStockContainerItem(item) {
    const container = document.createElement('div');
    container.className = 'stock-container';
    container.style.opacity = 0;

    const stockItem = document.createElement('div');
    // Column widths (grid-cols) must stay in sync with the header row template in watchlist.html, or header/row columns drift out of alignment
    stockItem.className = 'stock-item grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1.75rem_1.75rem] laptop:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_2.5rem_2.5rem] gap-grout bg-deep cut-sm w-full items-stretch min-h-9 text-label laptop:text-mono desktop:text-small desktopXL:text-value select-none transition-[filter] duration-hover hover:brightness-110';

    const cellBaseClass = 'wl-cell';

    // A real link (/WFC) so middle-click / ctrl-click open the ticker in a new tab.
    const nameDiv = document.createElement('a');
    nameDiv.href = tickerPath(item.ticker);
    nameDiv.className = cellBaseClass + ' wl-name cursor-pointer';
    nameDiv.textContent = item.name ? `${item.name} (${item.ticker})` : item.ticker;
    nameDiv.title = nameDiv.textContent;

    const priceDiv = document.createElement('div');
    const priceRangeColorClass = getCurrentPriceRangeColorClass(item.currentPrice, item.goodBuyPrice, item.badBuyPrice);
    priceDiv.className = cellBaseClass + ' ' + (priceRangeColorClass || 'bg-canopy text-cream');
    priceDiv.textContent = formatPrice(item.currentPrice);
    const tierLabel = getBuyTierLabel(item.currentPrice, item.goodBuyPrice, item.badBuyPrice);
    if (tierLabel) {
        // Shown through CSS (::after) so the verdict reads as a word, not just a colour.
        priceDiv.classList.add('wl-tier');
        priceDiv.dataset.tier = tierLabel;
        priceDiv.title = tierLabel + ' buy';
    }
    if (isLifetimeNegative(item.currentPrice, item.lifetimeStartPrice)) {
        priceDiv.classList.add('wl-net-negative');
        priceDiv.title = (tierLabel ? tierLabel + ' buy · ' : '') + 'down over its lifetime';
    }

    const gbPriceDiv = document.createElement('div');
    gbPriceDiv.className = cellBaseClass + ' bg-band-great-1';
    gbPriceDiv.textContent = item.goodBuyPrice;

    const bbPriceDiv = document.createElement('div');
    bbPriceDiv.className = cellBaseClass + ' bg-band-bad-1 text-cream';
    bbPriceDiv.textContent = item.badBuyPrice;

    const dividendDiv = document.createElement('div');
    dividendDiv.className = cellBaseClass + ' bg-canopy text-cream';
    dividendDiv.textContent = item.dividendYield || '—';

    const folderIcon = document.createElement('button');
    folderIcon.type = 'button';
    folderIcon.className = ICON_CELL;
    folderIcon.title = 'Add to watchlists';
    folderIcon.setAttribute('aria-label', 'Add to watchlists');
    folderIcon.innerHTML = FOLDER_SVG;

    const deleteIcon = document.createElement('button');
    deleteIcon.type = 'button';
    deleteIcon.className = 'delete-icon ' + ICON_CELL;
    deleteIcon.id = "watchlistDeleteButton";
    deleteIcon.title = 'Remove from watchlist';
    deleteIcon.setAttribute('aria-label', 'Delete');
    deleteIcon.innerHTML = TRASH_SVG;

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

// Mobile version of createStockContainerItem() — same item shape and event
// handlers. A grouped tile block (name and actions over price / GB / BB /
// dividend yield tiles), not a card.
function createStockCardItem(item) {
    const card = document.createElement('div');
    card.className = 'flex flex-col gap-grout bg-deep cut-sm cursor-pointer active:brightness-110';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    // Header: name + ticker, then the two row actions as 44px-wide touch targets.
    const header = document.createElement('div');
    header.className = 'grid grid-cols-[1fr_2.75rem_2.75rem] gap-grout';

    const nameCol = document.createElement('div');
    nameCol.className = 'flex flex-col justify-center gap-0.5 min-w-0 min-h-11 bg-canopy px-3 py-2 text-cream';
    const nameEl = document.createElement('div');
    nameEl.className = 'text-body font-semibold leading-tight truncate';
    nameEl.textContent = item.name || item.ticker;
    const tickerEl = document.createElement('div');
    tickerEl.className = 'caps text-label tracking-caps-label text-sand';
    tickerEl.textContent = item.ticker;
    nameCol.appendChild(nameEl);
    nameCol.appendChild(tickerEl);

    const folderBtn = document.createElement('button');
    folderBtn.type = 'button';
    folderBtn.className = ICON_CELL;
    folderBtn.title = 'Add to watchlists';
    folderBtn.setAttribute('aria-label', 'Add to watchlists');
    folderBtn.innerHTML = FOLDER_SVG;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = ICON_CELL;
    deleteBtn.title = 'Remove from watchlist';
    deleteBtn.setAttribute('aria-label', 'Delete');
    deleteBtn.innerHTML = TRASH_SVG;

    // Stat tiles: a small caption over the value, so "GB"/"BB" never stand alone.
    const makeTile = (caption, value, colorClass, extra) => {
        const tile = document.createElement('div');
        tile.className = 'flex flex-col min-w-0 items-center justify-center gap-0.5 px-0.5 py-2 text-center ' + colorClass;
        const captionEl = document.createElement('span');
        // Inherits the tile's own text colour (ink on light tiles, cream on dark ones) so
        // the caption keeps the same contrast as the value on every tier colour.
        captionEl.className = 'caps text-label font-semibold tracking-caps-label text-current';
        captionEl.textContent = caption;
        const valueEl = document.createElement('span');
        valueEl.className = 'max-w-full font-mono text-mono font-semibold leading-tight tabular-nums truncate';
        valueEl.textContent = value;
        tile.appendChild(captionEl);
        tile.appendChild(valueEl);
        if (extra) tile.appendChild(extra);
        return tile;
    };

    const priceRangeColorClass = getCurrentPriceRangeColorClass(item.currentPrice, item.goodBuyPrice, item.badBuyPrice);
    const tierLabel = getBuyTierLabel(item.currentPrice, item.goodBuyPrice, item.badBuyPrice);
    let tierEl = null;
    if (tierLabel) {
        // The verdict reads as a word, not just a colour.
        tierEl = document.createElement('span');
        tierEl.className = 'caps text-label font-semibold tracking-caps-label';
        tierEl.textContent = tierLabel;
    }
    const currentPricePill = makeTile('Price', formatPrice(item.currentPrice), priceRangeColorClass || 'bg-cream text-ink', tierEl);
    if (tierLabel) currentPricePill.title = tierLabel + ' buy';
    if (isLifetimeNegative(item.currentPrice, item.lifetimeStartPrice)) {
        currentPricePill.classList.add('wl-net-negative');
        currentPricePill.title = (tierLabel ? tierLabel + ' buy · ' : '') + 'down over its lifetime';
    }
    const gbPill = makeTile('Good', item.goodBuyPrice, 'bg-band-great-1 text-ink');
    const bbPill = makeTile('Bad', item.badBuyPrice, 'bg-band-bad-1 text-cream');
    const divPill = makeTile('Div', item.dividendYield || '—', 'bg-canopy text-cream');

    const tiles = document.createElement('div');
    tiles.className = 'grid grid-cols-4 gap-grout';
    tiles.appendChild(currentPricePill);
    tiles.appendChild(gbPill);
    tiles.appendChild(bbPill);
    tiles.appendChild(divPill);

    header.appendChild(nameCol);
    header.appendChild(folderBtn);
    header.appendChild(deleteBtn);
    card.appendChild(header);
    card.appendChild(tiles);

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
    card.addEventListener('keydown', function (event) {
        if (event.target === card && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            openTickerFromList(item.ticker);
        }
    });

    return card;
}
