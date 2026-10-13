/* Ticker Info price-history chart (Chart.js is loaded from a CDN by tickerInfo.html). */
const chartRangeButtons = document.getElementById("chartRangeButtons");

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
