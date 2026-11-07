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

    function applyRange(months) {
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
