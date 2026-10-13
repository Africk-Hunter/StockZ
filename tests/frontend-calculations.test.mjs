import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateAverageMonthlyChange, findDipInformation, computeBuyRanges } from "../public/src/lib/buy-range.mjs";

const BAND_KEYS = ["greatBRLow", "greatBRHigh", "goodBRLow", "goodBRHigh", "okayBRLow", "okayBRHigh", "badBRLow", "badBRHigh"];

// Most recent first, like the /run-calculations response.
const crashAndRecover = [120, 110, 100, 60, 90, 100, 105, 110];
const steadyClimb = [130, 120, 110, 100, 90, 80, 70, 60];

test("calculateAverageMonthlyChange", () => {
  assert.equal(calculateAverageMonthlyChange([100]), 0);
  assert.equal(calculateAverageMonthlyChange([]), 0);
  assert.ok(Math.abs(calculateAverageMonthlyChange([110, 100]) - 0.1) < 1e-12);
  const expected = (100 / 110 + 110 / 121) / 2 - 1;
  assert.ok(Math.abs(calculateAverageMonthlyChange([100, 110, 121]) - expected) < 1e-12);
});

test("findDipInformation finds the big drop without lowering the threshold", () => {
  const dip = findDipInformation(crashAndRecover);
  assert.equal(dip.recoveryLowPrice, 60);
  assert.equal(typeof dip.recoveryLowMonth, "number");
  assert.equal(typeof dip.dropStartMonth, "number");
  assert.ok(dip.preDropPrice > dip.recoveryLowPrice);
  assert.equal(dip.thresholdLowered, false);
});

test("findDipInformation lowers the threshold for low-volatility data", () => {
  // Largest monthly drop is ~5%, below the initial 10% threshold.
  const calm = [100, 105, 100, 104, 108, 112, 110, 115];
  const dip = findDipInformation(calm);
  assert.equal(dip.thresholdLowered, true);
  for (const [key, value] of Object.entries(dip)) {
    if (key !== "thresholdLowered") assert.ok(Number.isFinite(value), `${key} unset: ${value}`);
  }
});

test("findDipInformation never leaves values unset, even for monotonic, flat or tiny data", () => {
  for (const series of [steadyClimb, [50, 50, 50, 50], [10, 20], [42]]) {
    const dip = findDipInformation(series);
    for (const [key, value] of Object.entries(dip)) {
      if (key !== "thresholdLowered") assert.ok(Number.isFinite(value), `${series}: ${key} = ${value}`);
    }
  }
});

test("computeBuyRanges returns ordered bands on an 8-step grid", () => {
  const { calculations: calc, thresholdLowered } = computeBuyRanges(crashAndRecover, "TEST");
  assert.equal(thresholdLowered, false);
  assert.equal(calc.ticker, "TEST");
  assert.equal(calc.currentPrice, 120);
  assert.equal(calc.dipPrice, 60);
  for (const key of BAND_KEYS) assert.ok(Number.isFinite(calc[key]), key);
  for (let i = 1; i < BAND_KEYS.length; i++) {
    assert.ok(calc[BAND_KEYS[i]] >= calc[BAND_KEYS[i - 1]], `${BAND_KEYS[i]} < ${BAND_KEYS[i - 1]}`);
  }
  const step = (calc.badBRHigh - calc.greatBRLow) / 8;
  assert.ok(Math.abs(calc.greatBRHigh - calc.greatBRLow - step) < 1e-9);
  assert.ok(Math.abs(calc.goodBRLow - calc.greatBRHigh - step) < 1e-9);
  // great/good/okay each span 1 step with a 1-step gap; bad spans the final 2.
  assert.ok(Math.abs(calc.badBRHigh - calc.badBRLow - 2 * step) < 1e-9);
});

test("computeBuyRanges is deterministic and does not mutate its input", () => {
  const input = [...crashAndRecover];
  assert.deepEqual(computeBuyRanges(input, "X"), computeBuyRanges(input, "X"));
  assert.deepEqual(input, crashAndRecover);
});

test("computeBuyRanges drops non-positive closes but reports the raw current price", () => {
  const { calculations: calc } = computeBuyRanges([0, ...crashAndRecover], "X");
  for (const key of BAND_KEYS) assert.ok(Number.isFinite(calc[key]), key);
  assert.equal(calc.currentPrice, 0);
});

// Regression: fewer than two usable closes (e.g. a brand-new listing) used to
// give NaN for every band.
test("computeBuyRanges collapses the bands onto the price for <2 usable closes", () => {
  const { calculations: single, thresholdLowered } = computeBuyRanges([42], "NEW");
  assert.equal(thresholdLowered, true);
  for (const key of BAND_KEYS) assert.equal(single[key], 42, key);

  const { calculations: allBad } = computeBuyRanges([0, 0, 0], "X");
  for (const key of BAND_KEYS) assert.ok(Number.isFinite(allBad[key]), key);
});
