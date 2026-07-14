import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMetalType,
  getRegionalMultiplier,
  parseWeightRange,
  calculateMetalValue,
  calculateTotalValue,
  calculateMetalValueAtYard,
  calculateTotalValueAtYard,
  METAL_PRICES,
} from './pricing';
import type { ScrapYard } from './yards';

// ---------------------------------------------------------------------------
// Deterministic test yards
// ---------------------------------------------------------------------------

const BASE_YARD: ScrapYard = {
  id: 'yard-base',
  name: 'Base Yard',
  city: 'Testville',
  state: 'TX',
  latitude: 0,
  longitude: 0,
  payoutFactor: 1.0,
};

const GENEROUS_YARD: ScrapYard = {
  ...BASE_YARD,
  id: 'yard-generous',
  name: 'Generous Yard',
  payoutFactor: 1.1,
};

// Yard that doubles the light_iron payout via a grade premium.
const IRON_SPECIALIST_YARD: ScrapYard = {
  ...BASE_YARD,
  id: 'yard-iron',
  name: 'Iron Specialist',
  gradePremiums: { light_iron: 2.0 },
};

// ---------------------------------------------------------------------------
// normalizeMetalType
// ---------------------------------------------------------------------------

test('normalizeMetalType resolves canonical grade keys directly', () => {
  assert.equal(normalizeMetalType('copper_bare_bright'), 'copper_bare_bright');
  assert.equal(normalizeMetalType('light_iron'), 'light_iron');
  assert.equal(normalizeMetalType('pcb_high_grade'), 'pcb_high_grade');
  assert.equal(normalizeMetalType('ev_copper_busbar'), 'ev_copper_busbar');
});

test('normalizeMetalType resolves unambiguous aliases', () => {
  assert.equal(normalizeMetalType('brass'), 'yellow_brass');
  assert.equal(normalizeMetalType('aluminum'), 'aluminum_clean');
  assert.equal(normalizeMetalType('steel'), 'light_iron');
  assert.equal(normalizeMetalType('copper'), 'copper_2');
  assert.equal(normalizeMetalType('motor'), 'electric_motor');
  assert.equal(normalizeMetalType('radiator'), 'acr');
});

test('normalizeMetalType is case-insensitive and trims whitespace', () => {
  assert.equal(normalizeMetalType('  Copper  '), 'copper_2');
  assert.equal(normalizeMetalType('Yellow Brass'), 'yellow_brass');
  assert.equal(normalizeMetalType('LIGHT IRON'), 'light_iron');
});

test('normalizeMetalType falls back to substring matching', () => {
  assert.equal(normalizeMetalType('old copper pipe'), 'copper_2');
  assert.equal(normalizeMetalType('shiny aluminium thing'), 'aluminum_clean');
  assert.equal(normalizeMetalType('rusty bronze statue'), 'bronze');
  assert.equal(normalizeMetalType('insulated copper wire bundle'), 'copper_icw');
});

test('normalizeMetalType recognizes EV/e-waste grades', () => {
  assert.equal(normalizeMetalType('busbar'), 'ev_copper_busbar');
  assert.equal(normalizeMetalType('copper busbar'), 'ev_copper_busbar');
  assert.equal(normalizeMetalType('circuit board'), 'pcb_high_grade');
  assert.equal(normalizeMetalType('pcb'), 'pcb_high_grade');
  assert.equal(normalizeMetalType('gpu'), 'pcb_high_grade');
});

test('normalizeMetalType returns null for unknown metals', () => {
  assert.equal(normalizeMetalType('plutonium'), null);
  assert.equal(normalizeMetalType(''), null);
});

// ---------------------------------------------------------------------------
// getRegionalMultiplier
// ---------------------------------------------------------------------------

test('getRegionalMultiplier returns the configured state multiplier', () => {
  assert.equal(getRegionalMultiplier('AK'), 1.15);
  assert.equal(getRegionalMultiplier('WV'), 0.85);
});

test('getRegionalMultiplier is case-insensitive', () => {
  assert.equal(getRegionalMultiplier('ak'), 1.15);
});

test('getRegionalMultiplier defaults to 1.0 for unknown or missing states', () => {
  assert.equal(getRegionalMultiplier('XX'), 1.0);
  assert.equal(getRegionalMultiplier(''), 1.0);
  assert.equal(getRegionalMultiplier(undefined), 1.0);
});

// ---------------------------------------------------------------------------
// parseWeightRange
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// calculateMetalValue
// ---------------------------------------------------------------------------

test('calculateMetalValue multiplies weight x price x multiplier', () => {
  // aluminum_clean = { low: 0.55, high: 1.25 }
  const value = calculateMetalValue('aluminum', '10-20 lbs', 1.0);
  assert.deepEqual(value, { valueLow: 5.5, valueHigh: 25 });
});

test('calculateMetalValue applies the regional multiplier', () => {
  // light_iron = { low: 0.08, high: 0.11 }
  const value = calculateMetalValue('light iron', '100-200 lbs', 0.9);
  assert.deepEqual(value, { valueLow: 7.2, valueHigh: 19.8 });
});

test('calculateMetalValue yields zero for unknown metals', () => {
  const value = calculateMetalValue('plutonium', '1-2 lbs', 1.0);
  assert.deepEqual(value, { valueLow: 0, valueHigh: 0 });
});

// ---------------------------------------------------------------------------
// calculateTotalValue
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// calculateMetalValueAtYard
// ---------------------------------------------------------------------------

test('calculateMetalValueAtYard matches base calc when factors are 1.0', () => {
  // aluminum_clean = { low: 0.55, high: 1.25 }; payoutFactor 1.0, no premium
  const value = calculateMetalValueAtYard('aluminum', '10-20 lbs', 1.0, BASE_YARD);
  assert.deepEqual(value, { valueLow: 5.5, valueHigh: 25 });
});

test('calculateMetalValueAtYard scales linearly with the state multiplier', () => {
  const value = calculateMetalValueAtYard('aluminum', '10-20 lbs', 2.0, BASE_YARD);
  assert.deepEqual(value, { valueLow: 11, valueHigh: 50 });
});

test('calculateMetalValueAtYard applies a yard grade premium', () => {
  // light_iron = { low: 0.08, high: 0.11 }; premium doubles the payout.
  const plain = calculateMetalValueAtYard('light iron', '100-100 lbs', 1.0, BASE_YARD);
  assert.deepEqual(plain, { valueLow: 8, valueHigh: 11 });
  const premium = calculateMetalValueAtYard('light iron', '100-100 lbs', 1.0, IRON_SPECIALIST_YARD);
  assert.deepEqual(premium, { valueLow: 16, valueHigh: 22 });
});

test('calculateMetalValueAtYard pays more at a higher payoutFactor yard', () => {
  const base = calculateMetalValueAtYard('aluminum', '10-20 lbs', 1.0, BASE_YARD);
  const generous = calculateMetalValueAtYard('aluminum', '10-20 lbs', 1.0, GENEROUS_YARD);
  assert.ok(generous.valueLow > base.valueLow);
  assert.ok(generous.valueHigh > base.valueHigh);
});

// ---------------------------------------------------------------------------
// calculateTotalValueAtYard
// ---------------------------------------------------------------------------

test('calculateTotalValueAtYard sums per-metal payouts at a yard', () => {
  const total = calculateTotalValueAtYard(
    [
      { type: 'aluminum', weightRange: '10-20 lbs' }, // { 5.5, 25 }
      { type: 'light iron', weightRange: '100-100 lbs' }, // { 8, 11 }
    ],
    1.0,
    BASE_YARD,
  );
  assert.deepEqual(total, { totalLow: 13.5, totalHigh: 36 });
});

test('calculateTotalValueAtYard returns zeros for an empty list', () => {
  assert.deepEqual(calculateTotalValueAtYard([], 1.0, BASE_YARD), { totalLow: 0, totalHigh: 0 });
});

// ---------------------------------------------------------------------------
// METAL_PRICES sanity
// ---------------------------------------------------------------------------

test('core grades exist with sane low/high ranges', () => {
  const grades = ['copper_bare_bright', 'light_iron', 'aluminum_clean', 'pcb_high_grade', 'ev_copper_busbar'];
  for (const grade of grades) {
    const price = METAL_PRICES[grade];
    assert.ok(price, `Missing grade: ${grade}`);
    assert.ok(price!.low > 0, `${grade}.low must be > 0`);
    assert.ok(price!.high >= price!.low, `${grade}: high must be >= low`);
  }
});
