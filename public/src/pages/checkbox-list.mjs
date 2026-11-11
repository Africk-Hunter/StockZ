// DOM builders shared by the export and remove modals' checkbox lists.

const CHECKBOX_CLASS = 'check disabled:cursor-default';

export function createCheckboxInput() {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = CHECKBOX_CLASS;
    return checkbox;
}

// "Your watch list is empty." style placeholder shown instead of a list.
export function createEmptyNote(text) {
    const empty = document.createElement('p');
    empty.className = 'bg-canopy text-small text-sand text-center py-4';
    empty.textContent = text;
    return empty;
}

// A selectable "All" style row: checkbox + bold label.
export function createSelectAllRow(checkbox, text) {
    const row = document.createElement('label');
    row.className = 'opt cursor-pointer';
    const name = document.createElement('span');
    name.className = 'font-semibold';
    name.textContent = text;
    row.appendChild(checkbox);
    row.appendChild(name);
    return row;
}

// A selectable stock row: checkbox + ticker + company name.
export function createStockRow(item, checkbox) {
    const row = document.createElement('label');
    row.className = 'opt cursor-pointer';

    const tickerSpan = document.createElement('span');
    tickerSpan.className = 'caps text-label tracking-caps-label flex-shrink-0';
    tickerSpan.textContent = item.ticker;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'truncate text-small text-sand';
    nameSpan.textContent = item.name || '';

    row.appendChild(checkbox);
    row.appendChild(tickerSpan);
    row.appendChild(nameSpan);
    return row;
}
