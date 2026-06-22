import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMetalType,
  getRegionalMultiplier,
  parseWeightRange,
  calculateMetalValue,
  calculateTotalValue,
} from './pricing';

// --- normalizeMetalType ---------------------------------------------------

test('normalizeMetalType resolves canonical grade keys directly', () => {
  assert.equal(normalizeMetalType('copper_bare_bright'), 'copper_bare_bright');
  assert.equal(normalizeMetalType('light_iron'), 'light_iron');
});

test('normalizeMetalType resolves known aliases', () => {
  assert.equal(normalizeMetalType('brass'), 'yellow_brass');
  assert.equal(normalizeMetalType('aluminum'), 'aluminum_clean');
  assert.equal(normalizeMetalType('steel'), 'light_iron');
  assert.equal(normalizeMetalType('copper'), 'copper_2');
});

test('normalizeMetalType is case-insensitive and trims whitespace', () => {
  assert.equal(normalizeMetalType('  Copper  '), 'copper_2');
  assert.equal(normalizeMetalType('Yellow Brass'), 'yellow_brass');
});

test('normalizeMetalType falls back to substring matching', () => {
  assert.equal(normalizeMetalType('old copper pipe'), 'copper_2');
  assert.equal(normalizeMetalType('shiny aluminium thing'), 'aluminum_clean');
  assert.equal(normalizeMetalType('rusty bronze statue'), 'bronze');
  assert.equal(normalizeMetalType('insulated copper wire bundle'), 'copper_icw');
});

test('normalizeMetalType returns null for unknown metals', () => {
  assert.equal(normalizeMetalType('plutonium'), null);
  assert.equal(normalizeMetalType(''), null);
});

// --- getRegionalMultiplier ------------------------------------------------

test('getRegionalMultiplier returns the state multiplier', () => {
  assert.equal(getRegionalMultiplier('CA'), 1.15);
  assert.equal(getRegionalMultiplier('OH'), 0.90);
});

test('getRegionalMultiplier is case-insensitive', () => {
  assert.equal(getRegionalMultiplier('ca'), 1.15);
});

test('getRegionalMultiplier defaults to 1.0 for unknown or missing states', () => {
  assert.equal(getRegionalMultiplier('XX'), 1.0);
  assert.equal(getRegionalMultiplier(''), 1.0);
  assert.equal(getRegionalMultiplier(undefined), 1.0);
});

// --- parseWeightRange -----------------------------------------------------

test('parseWeightRange parses a low-high range', () => {
  assert.deepEqual(parseWeightRange('2-4 lbs'), { low: 2, high: 4 });
});

test('parseWeightRange parses decimals and tolerates spacing', () => {
  assert.deepEqual(parseWeightRange('2.5 - 4.5 lbs'), { low: 2.5, high: 4.5 });
});

test('parseWeightRange treats a single value as low === high', () => {
  assert.deepEqual(parseWeightRange('3'), { low: 3, high: 3 });
  assert.deepEqual(parseWeightRange('5 lbs'), { low: 5, high: 5 });
});

test('parseWeightRange returns zeros for unparseable input', () => {
  assert.deepEqual(parseWeightRange('heavy'), { low: 0, high: 0 });
});

// --- calculateMetalValue --------------------------------------------------

test('calculateMetalValue multiplies weight x price x regional multiplier', () => {
  // aluminum_clean = { low: 0.55, high: 1.25 }
  const value = calculateMetalValue('aluminum', '10-20 lbs', 1.0);
  assert.deepEqual(value, { valueLow: 5.5, valueHigh: 25 });
});

test('calculateMetalValue applies the regional multiplier', () => {
  // light_iron = { low: 0.08, high: 0.11 }; OH multiplier = 0.90
  const value = calculateMetalValue('light iron', '100-200 lbs', 0.9);
  assert.deepEqual(value, { valueLow: 7.2, valueHigh: 19.8 });
});

test('calculateMetalValue yields zero for unknown metals', () => {
  const value = calculateMetalValue('plutonium', '1-2 lbs', 1.0);
  assert.deepEqual(value, { valueLow: 0, valueHigh: 0 });
});

// --- calculateTotalValue --------------------------------------------------

test('calculateTotalValue sums per-metal low/high values', () => {
  const total = calculateTotalValue([
    { valueLow: 5.5, valueHigh: 25 },
    { valueLow: 7.2, valueHigh: 19.8 },
  ]);
  assert.deepEqual(total, { totalLow: 12.7, totalHigh: 44.8 });
});

test('calculateTotalValue returns zeros for an empty list', () => {
  assert.deepEqual(calculateTotalValue([]), { totalLow: 0, totalHigh: 0 });
});
