/* Buy-range math. Pure: no DOM, no storage. `closeData` / `rawData` is an array
   of monthly closes with the most recent first (index 0 is the current price). */

/* Dip-finding tuning constants */
export const DIP_SCORE_DECAY_PER_MONTH = 0.01;
export const INITIAL_DIP_THRESHOLD     = 0.10;
export const DIP_THRESHOLD_STEP        = 0.03;

function calculateScore(monthlyScore, changeRatio) {
    return monthlyScore + changeRatio;
}

export function calculateAverageMonthlyChange(closeData) {
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

// Finds the most significant price drop. `thresholdLowered` is true when no
// dip cleared the initial threshold (so the UI should warn the ranges are
// based on a weaker dip).
export function findDipInformation(closeData) {
    // Fewer than two closes means there's no month-over-month change to
    // score, so there is no dip. Treat the only known price as both the dip
    // and the pre-drop price so the bands collapse onto it instead of
    // coming out NaN.
    if (closeData.length < 2) {
        const price = closeData[0];
        return { recoveryLowMonth: 0, recoveryLowPrice: price, dropStartMonth: 0, preDropPrice: price, thresholdLowered: true };
    }

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

    return { recoveryLowMonth, recoveryLowPrice, dropStartMonth, preDropPrice, thresholdLowered: thresHoldChanged === 1 };

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

// Derives the great/good/okay/bad price bands for a stock. Returns
// `{ calculations, thresholdLowered }`; `calculations.currentPrice` is always
// the raw latest close.
//
// `skipRecentMonths` (default 0) makes the dip search look past the newest N
// closes, e.g. when the stock is in a dip right now and that dip would
// otherwise define the ranges. Month offsets stay relative to today, and
// `currentPrice` is still the real latest close. Ignored if it would leave
// fewer than two closes to analyse.
export function computeBuyRanges(rawData, ticker, { skipRecentMonths = 0 } = {}) {
    // A $0 (or otherwise non-positive/non-finite) close is bad data or a
    // delisting artifact. Every ratio in the dip/average math divides by an
    // adjacent close, so a zero produces Infinity/NaN and poisons every
    // band. Drop those months; currentPrice still reports the raw latest.
    const data = rawData.filter((price) => Number.isFinite(price) && price > 0);
    if (data.length === 0) {
        data.push(rawData[0] > 0 ? rawData[0] : 0.01);
    }

    const skip = Number.isInteger(skipRecentMonths) && skipRecentMonths > 0 && data.length - skipRecentMonths >= 2
        ? skipRecentMonths : 0;
    const analysed = skip ? data.slice(skip) : data;

    const averageMonthlyChange = calculateAverageMonthlyChange(analysed);
    const dip = findDipInformation(analysed);
    const { recoveryLowPrice, preDropPrice, thresholdLowered } = dip;
    const recoveryLowMonth = dip.recoveryLowMonth + skip;
    const dropStartMonth = dip.dropStartMonth + skip;
    let min = recoveryLowPrice + (recoveryLowMonth * (averageMonthlyChange * recoveryLowPrice));

    const priceInMiddleOfDip = (((3 * recoveryLowPrice) + (preDropPrice)) / 4);
    const monthsInMiddleOfDip = (dropStartMonth + recoveryLowMonth) / 2;

    let max = ((priceInMiddleOfDip * averageMonthlyChange) * monthsInMiddleOfDip) + priceInMiddleOfDip;

    if (max < min) {
        // The extrapolation can land max below min (e.g. for a stock in
        // genuine decline). Swap so `min` always anchors the cheapest
        // ("great buy") band and `max` the priciest ("bad buy") one.
        [min, max] = [max, min];
    }

    const amountChange = (max - min) / 8;

    const greatBRLow = min;
    const greatBRHigh = greatBRLow + amountChange;
    const goodBRLow = greatBRHigh + amountChange;
    const goodBRHigh = goodBRLow + amountChange;
    const okayBRLow = goodBRHigh + amountChange;
    const okayBRHigh = okayBRLow + amountChange;
    const badBRLow = okayBRHigh + amountChange;
    const badBRHigh = max;

    return {
        calculations: {
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
            currentPrice: rawData[0],
            // Oldest usable close (history is most recent first): lets the
            // watchlist flag stocks that are down over their whole lifetime.
            lifetimeStartPrice: data[data.length - 1]
        },
        thresholdLowered
    };
}

// The "look past the last N months" choices offered in the UI (0 = default).
export const SKIP_MONTH_OPTIONS = [3, 6, 12, 24];

// The watchlist stores only the outer bounds of the ranges. This precomputes
// them for every skip option from one price history, so switching the option
// later is a lookup instead of a re-fetch. Shape: { "3": { good: "1.23", bad: "4.56" }, ... }
export function computeBoundsBySkip(rawData, ticker) {
    const bounds = {};
    for (const months of SKIP_MONTH_OPTIONS) {
        const { calculations } = computeBuyRanges(rawData, ticker, { skipRecentMonths: months });
        bounds[months] = { good: calculations.greatBRLow.toFixed(2), bad: calculations.badBRHigh.toFixed(2) };
    }
    return bounds;
}
