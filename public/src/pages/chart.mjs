/* Ticker Info price-history chart (Chart.js is loaded from a CDN by tickerInfo.html). */
const chartRangeButtons = document.getElementById("chartRangeButtons");

// Chart.js draws on a canvas, so it cannot read the Tailwind theme; these
// mirror the Understory tokens.
const CHART_COLORS = { lime: '#9BCB5E', ember: '#D9744A', cream: '#F2ECD2', floor: '#1A3526', canopy: '#24432F' };
const CHART_FONT = "'Azeret Mono', ui-monospace, monospace";

const CHART_RANGE_OPTIONS = [
    { label: '1Y', months: 12 },
    { label: '5Y', months: 60 },
    { label: '10Y', months: 120 },
    { label: 'All', months: 'all' },
];

function initChartRangeButtons(onRangeChange) {
    if (!chartRangeButtons) return;
    chartRangeButtons.innerHTML = '';

    CHART_RANGE_OPTIONS.forEach((option) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = option.label;
        btn.className = 'chip h-11 min-w-0 text-small laptop:h-auto laptop:text-small desktop:text-body' + (option.months === 'all' ? ' is-on' : '');
        btn.setAttribute('aria-pressed', option.months === 'all' ? 'true' : 'false');

        btn.addEventListener('click', function() {
            chartRangeButtons.querySelectorAll('button').forEach((b) => {
                b.classList.remove('is-on');
                b.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('is-on');
            btn.setAttribute('aria-pressed', 'true');
            onRangeChange(option.months);
        });

        chartRangeButtons.appendChild(btn);
    });
}

// Buy-range bands shaded behind the price line. Colours mirror the band-*
// tokens in tailwind.config.js (great / good / okay / bad).
const BAND_STYLES = [
    { key: 'great', label: 'Great', rgb: '155, 203, 94' },
    { key: 'good', label: 'Good', rgb: '245, 222, 130' },
    { key: 'okay', label: 'Okay', rgb: '224, 127, 82' },
    { key: 'bad', label: 'Bad', rgb: '184, 54, 59' },
];
let buyBands = [];
let liveChart = null;

// Called whenever the buy ranges are (re)computed, before or after the chart exists.
export function setChartBuyRanges(calculations) {
    buyBands = [];
    if (calculations) {
        BAND_STYLES.forEach((style) => {
            const low = Number(calculations[style.key + 'BRLow']);
            const high = Number(calculations[style.key + 'BRHigh']);
            if (Number.isFinite(low) && Number.isFinite(high) && high > 0 && high >= low) {
                buyBands.push({ ...style, low, high });
            }
        });
    }
    if (liveChart) liveChart.update();
}

const buyBandsPlugin = {
    id: 'stockChartBuyBands',
    beforeDatasetsDraw(chart) {
        const area = chart.chartArea;
        const yScale = chart.scales.y;
        if (!area || !yScale || !buyBands.length) return;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
        ctx.clip();
        buyBands.forEach((band) => {
            // getPixelForValue handles linear and log axes alike. Bands are at
            // least a hairline tall so a very narrow one still shows.
            const yHigh = yScale.getPixelForValue(band.high);
            const yLow = band.low > 0 ? yScale.getPixelForValue(band.low) : area.bottom;
            const top = Math.min(yHigh, yLow);
            const height = Math.max(Math.abs(yLow - yHigh), 2);
            ctx.fillStyle = `rgba(${band.rgb}, 0.22)`;
            ctx.fillRect(area.left, top, area.right - area.left, height);
            ctx.fillStyle = `rgba(${band.rgb}, 0.9)`;
            ctx.font = `600 10px ${CHART_FONT}`;
            ctx.textBaseline = 'top';
            ctx.fillText(band.label.toUpperCase(), area.left + 6, top + 2);
        });
        ctx.restore();
    }
};

export function createStockChart(stockData) {
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
        // Lime when rising, ember when falling; fill is the line colour at 18%.
        return rising
            ? { line: CHART_COLORS.lime, fill: 'rgba(155, 203, 94, 0.18)' }
            : { line: CHART_COLORS.ember, fill: 'rgba(217, 116, 74, 0.18)' };
    }

    // Direction is also stated in words: a sign and an arrow beside the range buttons.
    // The period is spelled out ("over 5 years", "over its lifetime") so the
    // percentage is never ambiguous. A range longer than the stock's history
    // is the lifetime too, not a false "10 years".
    function describePeriod(months, pointCount) {
        if (months === 'all' || pointCount < months) return 'over its lifetime';
        if (months % 12 === 0) {
            const years = months / 12;
            return years === 1 ? 'over 1 year' : `over ${years} years`;
        }
        return `over ${months} months`;
    }

    function showDelta(rangePrices, months) {
        const el = document.getElementById('chartDelta');
        if (!el || rangePrices.length < 2) {
            if (el) el.classList.add('hidden');
            return;
        }
        const first = rangePrices[0];
        const last = rangePrices[rangePrices.length - 1];
        const pct = first ? ((last - first) / first) * 100 : 0;
        const tone = pct > 0 ? 'bg-lime text-ink' : pct < 0 ? 'bg-ember text-ink' : 'bg-canopy text-cream';
        const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '▬';
        el.className = 'cut-sm px-3 py-2 font-mono text-body font-semibold tabular-nums whitespace-nowrap self-start laptop:self-auto ' + tone;
        el.textContent = `${arrow} ${pct > 0 ? '+' : ''}${pct.toFixed(2)}% ${describePeriod(months, rangePrices.length)}`;
    }

    let initialRange = sliceForRange('all');
    showDelta(initialRange.prices, 'all');
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
            chartCtx.strokeStyle = 'rgba(242, 236, 210, 0.4)';
            chartCtx.stroke();
            chartCtx.restore();
        }
    };

    if (Chart.defaults) {
        Chart.defaults.color = CHART_COLORS.cream;
        Chart.defaults.font.family = CHART_FONT;
        Chart.defaults.borderColor = 'rgba(242, 236, 210, 0.22)';
    }

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
                pointHoverBorderColor: CHART_COLORS.cream,
                pointHoverBorderWidth: 1,
            }]
        },
        plugins: [buyBandsPlugin, crosshairPlugin],
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
                            return '$' + value;
                        },
                        font: {
                            size: window.innerWidth < 640 ? 12 : getFontSize(),
                        }
                    },
                    title: {
                        display: window.innerWidth >= 640,
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
                    backgroundColor: CHART_COLORS.floor,
                    titleColor: CHART_COLORS.cream,
                    bodyColor: CHART_COLORS.cream,
                    titleFont: { family: CHART_FONT },
                    bodyFont: { family: CHART_FONT },
                    borderColor: CHART_COLORS.canopy,
                    borderWidth: 1.5,
                    cornerRadius: 0,
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

    liveChart = stockChart;

    // Ctrl + scroll (or a trackpad pinch) zooms the time axis around the
    // cursor; double-click resets. The y-axis refits to the visible points.
    // `view` holds fractional point indices, or null when showing everything.
    let view = null;
    const canvas = document.getElementById('stockChart');
    canvas.title = 'Ctrl + scroll to zoom, drag to pan when zoomed, double-click to reset';

    function resetZoom() {
        view = null;
        delete stockChart.options.scales.x.min;
        delete stockChart.options.scales.x.max;
    }

    function updateCursor(dragging) {
        canvas.style.cursor = dragging ? 'grabbing' : (view ? 'grab' : '');
        const reset = document.getElementById('chartZoomReset');
        if (reset) reset.disabled = !view; // nothing to reset at full view
    }

    // Show `span` points starting at fractional index `min`, clamped to the data.
    function setView(min, span) {
        const last = stockChart.data.labels.length - 1;
        if (last < 3) return;
        span = Math.min(last, Math.max(Math.min(4, last), span));
        if (span >= last) {
            resetZoom();
        } else {
            min = Math.min(Math.max(min, 0), last - span);
            view = { min, max: min + span };
            stockChart.options.scales.x.min = Math.round(view.min);
            stockChart.options.scales.x.max = Math.round(view.max);
        }
        updateCursor(false);
        stockChart.update('none');
    }

    // Zoom by `factor` (<1 zooms in), keeping the point at `frac` (0..1 across
    // the plot area) where it is.
    function zoomBy(factor, frac) {
        const cur = view || { min: 0, max: stockChart.data.labels.length - 1 };
        const span = cur.max - cur.min;
        setView(cur.min + frac * span - frac * span * factor, span * factor);
    }

    function fracForX(offsetX) {
        const area = stockChart.chartArea;
        if (!area) return 0.5;
        return Math.min(1, Math.max(0, (offsetX - area.left) / (area.right - area.left)));
    }

    canvas.addEventListener('wheel', function(e) {
        if (!e.ctrlKey) return; // plain scrolling still scrolls the page
        e.preventDefault();
        zoomBy(e.deltaY < 0 ? 0.8 : 1.25, fracForX(e.offsetX));
    }, { passive: false });

    canvas.addEventListener('dblclick', function() {
        resetZoom();
        updateCursor(false);
        stockChart.update('none');
    });

    // Click-and-drag to pan once zoomed in. Vertical touch drags still scroll
    // the page (touch-action: pan-y); horizontal ones pan the chart.
    canvas.style.touchAction = 'pan-y';
    let drag = null;
    canvas.addEventListener('pointerdown', function(e) {
        if (!view || (e.pointerType === 'mouse' && e.button !== 0)) return;
        drag = { x: e.clientX, min: view.min, span: view.max - view.min, id: e.pointerId };
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
        updateCursor(true);
    });
    canvas.addEventListener('pointermove', function(e) {
        if (!drag || e.pointerId !== drag.id) return;
        const area = stockChart.chartArea;
        if (!area) return;
        const shift = -((e.clientX - drag.x) / (area.right - area.left)) * drag.span;
        setView(drag.min + shift, drag.span);
        if (view) updateCursor(true);
    });
    function endDrag(e) {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        updateCursor(false);
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // On-screen controls for when there's no scroll wheel (phones, trackpads).
    const zoomIn = document.getElementById('chartZoomIn');
    const zoomOut = document.getElementById('chartZoomOut');
    const zoomReset = document.getElementById('chartZoomReset');
    if (zoomIn) zoomIn.addEventListener('click', () => zoomBy(0.6, 0.5));
    if (zoomOut) zoomOut.addEventListener('click', () => zoomBy(1 / 0.6, 0.5));
    if (zoomReset) zoomReset.addEventListener('click', () => {
        resetZoom();
        updateCursor(false);
        stockChart.update('none');
    });

    function applyRange(months) {
        resetZoom();
        updateCursor(false);
        let range = sliceForRange(months);
        let colors = colorsForPrices(range.prices);
        stockChart.data.labels = range.dates;
        stockChart.data.datasets[0].data = range.prices;
        stockChart.data.datasets[0].borderColor = colors.line;
        stockChart.data.datasets[0].backgroundColor = colors.fill;
        stockChart.data.datasets[0].pointHoverBackgroundColor = colors.line;
        showDelta(range.prices, months);
        stockChart.update();
    }

    initChartRangeButtons(applyRange);

    // Linear vs logarithmic y-axis. On a log axis equal percentage moves take
    // equal vertical distance, so steady growth reads as a straight line.
    const scaleToggle = document.getElementById('chartScaleToggle');
    function setLogScale(on) {
        stockChart.options.scales.y.type = on ? 'logarithmic' : 'linear';
        if (scaleToggle) {
            scaleToggle.classList.toggle('is-on', on);
            scaleToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        stockChart.update();
    }
    if (scaleToggle) {
        if (!chronoPrices.every((p) => p > 0)) scaleToggle.classList.add('hidden');
        scaleToggle.addEventListener('click', function() {
            let on = !scaleToggle.classList.contains('is-on');
            setLogScale(on);
            try { localStorage.setItem('chartLogScale', on ? '1' : '0'); } catch (e) { /* storage unavailable */ }
        });
        try {
            // Log needs strictly positive prices; fall back to linear otherwise.
            if (localStorage.getItem('chartLogScale') === '1' && chronoPrices.every((p) => p > 0)) setLogScale(true);
        } catch (e) { /* storage unavailable */ }
    }

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
