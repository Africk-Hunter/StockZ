/* Display formatting helpers. */

// "$12.34", or an em dash when there is no price yet.
export function formatPrice(price) {
    return price != null ? `$${Number(price).toFixed(2)}` : '—';
}

export function formatMarketCap(cap) {
    if (typeof cap !== 'number' || !Number.isFinite(cap)) return "N/A";
    const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"]];
    for (const [size, suffix] of units) {
        if (cap >= size) return "$" + (cap / size).toFixed(2) + suffix;
    }
    return "$" + cap.toLocaleString();
}
