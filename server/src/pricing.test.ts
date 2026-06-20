import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMetalType,
  calculateMetalValue,
  calculateMetalValueAtYard,
  calculateTotalValueAtYard,
  METAL_PRICES,
  METAL_ALIASES,
} from './pricing';
import type { ScrapYard } from './yards';

// ---------------------------------------------------------------------------
// Fixture yard for deterministic tests
// ---------------------------------------------------------------------------

const BASE_YARD: ScrapYard = {
  id: 'test-01',
  name: 'Test Yard',
  city: 'Test City',
  state: 'TX',
  latitude: 29.76,
  longitude: -95.37,
  payoutFactor: 1.0,
};

const PREMIUM_YARD: ScrapYard = {
  ...BASE_YARD,
  id: 'test-02',
  name: 'Premium Yard',
  payoutFactor: 1.10,
  gradePremiums: { copper_bare_bright: 1.05, nmc_black_mass: 1.08 },
};

const LOWBALL_YARD: ScrapYard = {
  ...BASE_YARD,
  id: 'test-03',
  name: 'Lowball Yard',
  payoutFactor: 0.88,
};

// TX state multiplier from REGIONAL_MULTIPLIERS
const TX_MULTIPLIER = 1.05;

// ---------------------------------------------------------------------------
// normalizeMetalType — existing + new EV/battery grades
// ---------------------------------------------------------------------------

test('normalizeMetalType resolves canonical keys directly', () => {
  assert.equal(normalizeMetalType('copper_bare_bright'), 'copper_bare_bright');
  assert.equal(normalizeMetalType('nmc_black_mass'), 'nmc_black_mass');
  assert.equal(normalizeMetalType('li_ion_module'), 'li_ion_module');
  assert.equal(normalizeMetalType('pcb_high_grade'), 'pcb_high_grade');
});

test('normalizeMetalType resolves EV battery aliases', () => {
  assert.equal(normalizeMetalType('ev battery'), 'li_ion_module');
  assert.equal(normalizeMetalType('battery module'), 'li_ion_module');
  assert.equal(normalizeMetalType('battery pack'), 'li_ion_module');
  assert.equal(normalizeMetalType('lithium ion battery'), 'li_ion_module');
  assert.equal(normalizeMetalType('li-ion module'), 'li_ion_module');
});

test('normalizeMetalType resolves busbar aliases', () => {
  assert.equal(normalizeMetalType('busbar'), 'ev_copper_busbar');
  assert.equal(normalizeMetalType('ev busbar'), 'ev_copper_busbar');
  assert.equal(normalizeMetalType('copper busbar'), 'ev_copper_busbar');
  assert.equal(normalizeMetalType('EV Copper Busbar'), 'ev_copper_busbar');
});

test('normalizeMetalType resolves black mass aliases', () => {
  assert.equal(normalizeMetalType('black mass'), 'nmc_black_mass');
  assert.equal(normalizeMetalType('nmc black mass'), 'nmc_black_mass');
  assert.equal(normalizeMetalType('lfp black mass'), 'lfp_black_mass');
});

test('normalizeMetalType resolves PCB / circuit board aliases', () => {
  assert.equal(normalizeMetalType('circuit board'), 'pcb_high_grade');
  assert.equal(normalizeMetalType('motherboard'), 'pcb_high_grade');
  assert.equal(normalizeMetalType('bms board'), 'pcb_high_grade');
  assert.equal(normalizeMetalType('pcb'), 'pcb_high_grade');
  assert.equal(normalizeMetalType('gpu'), 'pcb_high_grade');
});

test('normalizeMetalType resolves cobalt and nickel aliases', () => {
  assert.equal(normalizeMetalType('cobalt'), 'cobalt_sulfate');
  assert.equal(normalizeMetalType('cobalt sulfate'), 'cobalt_sulfate');
  assert.equal(normalizeMetalType('nickel'), 'nickel_briquette');
  assert.equal(normalizeMetalType('nickel briquette'), 'nickel_briquette');
});

test('normalizeMetalType fuzzy fallback: busbar beats copper for "busbar" substring', () => {
  // "ev copper busbar" must not fall through to copper_2
  assert.equal(normalizeMetalType('ev copper busbar'), 'ev_copper_busbar');
});

test('normalizeMetalType fuzzy fallback: lithium substring resolves to li_ion_module', () => {
  assert.equal(normalizeMetalType('lithium cell'), 'li_ion_module');
});

test('normalizeMetalType returns null for completely unknown material', () => {
  assert.equal(normalizeMetalType('unobtainium'), null);
});

// Existing aliases still work
test('normalizeMetalType still resolves classic aliases after EV additions', () => {
  assert.equal(normalizeMetalType('bare bright'), 'copper_bare_bright');
  assert.equal(normalizeMetalType('radiator'), 'acr');
  assert.equal(normalizeMetalType('brass'), 'yellow_brass');
  assert.equal(normalizeMetalType('motor'), 'electric_motor');
  assert.equal(normalizeMetalType('steel'), 'light_iron');
});

// ---------------------------------------------------------------------------
// EV/battery grades exist in METAL_PRICES with sensible values
// ---------------------------------------------------------------------------

test('EV/battery grades are present in METAL_PRICES', () => {
  const expectedGrades = [
    'ev_copper_busbar', 'li_ion_module', 'nmc_black_mass', 'lfp_black_mass',
    'nickel_briquette', 'cobalt_sulfate', 'pcb_high_grade', 'pcb_low_grade',
  ];
  for (const grade of expectedGrades) {
    assert.ok(METAL_PRICES[grade], `Missing grade: ${grade}`);
    assert.ok(METAL_PRICES[grade]!.low > 0, `${grade}.low must be > 0`);
    assert.ok(METAL_PRICES[grade]!.high >= METAL_PRICES[grade]!.low, `${grade}: high < low`);
  }
});

test('battery/EV grades are priced relatively higher than light iron', () => {
  const lightIron = METAL_PRICES['light_iron']!;
  const pcbHigh = METAL_PRICES['pcb_high_grade']!;
  const nmcBlack = METAL_PRICES['nmc_black_mass']!;
  assert.ok(pcbHigh.low > lightIron.high * 5, 'pcb_high_grade should be >> light_iron');
  assert.ok(nmcBlack.low > lightIron.high * 5, 'nmc_black_mass should be >> light_iron');
});

// ---------------------------------------------------------------------------
// calculateMetalValueAtYard — deterministic math checks
// ---------------------------------------------------------------------------

test('calculateMetalValueAtYard matches calculateMetalValue when payoutFactor=1 and no gradePremium', () => {
  const weightRange = '2-4 lbs';
  const metalType = 'copper_bare_bright';
  const multiplier = TX_MULTIPLIER;

  const baseline = calculateMetalValue(metalType, weightRange, multiplier);
  const atYard = calculateMetalValueAtYard(metalType, weightRange, multiplier, BASE_YARD);

  assert.equal(atYard.valueLow, baseline.valueLow);
  assert.equal(atYard.valueHigh, baseline.valueHigh);
});

test('calculateMetalValueAtYard scales correctly with payoutFactor', () => {
  // Premium yard pays 10% more (payoutFactor = 1.10)
  const base = calculateMetalValueAtYard('copper_bare_bright', '2-4 lbs', TX_MULTIPLIER, BASE_YARD);
  const premium = calculateMetalValueAtYard('copper_bare_bright', '2-4 lbs', TX_MULTIPLIER, {
    ...BASE_YARD,
    payoutFactor: 1.10,
  });
  assert.ok(premium.valueLow > base.valueLow, 'Premium yard should pay more (low end)');
  assert.ok(premium.valueHigh > base.valueHigh, 'Premium yard should pay more (high end)');
  assert.equal(parseFloat((premium.valueHigh / base.valueHigh).toFixed(2)), 1.10);
});

test('calculateMetalValueAtYard applies gradePremium multiplicatively', () => {
  // PREMIUM_YARD has copper_bare_bright: 1.05
  const base = calculateMetalValueAtYard('copper_bare_bright', '2-4 lbs', TX_MULTIPLIER, {
    ...BASE_YARD,
    payoutFactor: 1.0,
  });
  const withPremium = calculateMetalValueAtYard('copper_bare_bright', '2-4 lbs', TX_MULTIPLIER, {
    ...BASE_YARD,
    payoutFactor: 1.0,
    gradePremiums: { copper_bare_bright: 1.05 },
  });
  assert.equal(parseFloat((withPremium.valueHigh / base.valueHigh).toFixed(2)), 1.05);
});

test('calculateMetalValueAtYard returns 0 for unknown metal type', () => {
  const result = calculateMetalValueAtYard('unobtainium', '1-2 lbs', 1.0, BASE_YARD);
  assert.equal(result.valueLow, 0);
  assert.equal(result.valueHigh, 0);
});

test('premium yard always pays more than lowball yard for same metal', () => {
  const metals = ['copper_bare_bright', 'nmc_black_mass', 'pcb_high_grade', 'li_ion_module'];
  for (const metal of metals) {
    const premium = calculateMetalValueAtYard(metal, '5-10 lbs', TX_MULTIPLIER, PREMIUM_YARD);
    const lowball = calculateMetalValueAtYard(metal, '5-10 lbs', TX_MULTIPLIER, LOWBALL_YARD);
    assert.ok(
      premium.valueHigh > lowball.valueHigh,
      `${metal}: premium (${premium.valueHigh}) should beat lowball (${lowball.valueHigh})`,
    );
  }
});

// ---------------------------------------------------------------------------
// calculateTotalValueAtYard
// ---------------------------------------------------------------------------

test('calculateTotalValueAtYard sums per-metal values correctly', () => {
  const metals = [
    { type: 'copper_bare_bright', weightRange: '2-4 lbs', percentage: 60 },
    { type: 'aluminum_clean', weightRange: '3-5 lbs', percentage: 40 },
  ];

  const cu = calculateMetalValueAtYard('copper_bare_bright', '2-4 lbs', TX_MULTIPLIER, BASE_YARD);
  const al = calculateMetalValueAtYard('aluminum_clean', '3-5 lbs', TX_MULTIPLIER, BASE_YARD);

  const expected = {
    totalLow: parseFloat((cu.valueLow + al.valueLow).toFixed(2)),
    totalHigh: parseFloat((cu.valueHigh + al.valueHigh).toFixed(2)),
  };

  const result = calculateTotalValueAtYard(metals, TX_MULTIPLIER, BASE_YARD);
  assert.equal(result.totalLow, expected.totalLow);
  assert.equal(result.totalHigh, expected.totalHigh);
});

test('calculateTotalValueAtYard returns 0 for empty metals array', () => {
  const result = calculateTotalValueAtYard([], TX_MULTIPLIER, BASE_YARD);
  assert.equal(result.totalLow, 0);
  assert.equal(result.totalHigh, 0);
});

test('best yard returns highest payout for the same haul', () => {
  const metals = [
    { type: 'nmc_black_mass', weightRange: '10-20 lbs', percentage: 70 },
    { type: 'ev_copper_busbar', weightRange: '3-6 lbs', percentage: 30 },
  ];
  const premiumResult = calculateTotalValueAtYard(metals, TX_MULTIPLIER, PREMIUM_YARD);
  const lowballResult = calculateTotalValueAtYard(metals, TX_MULTIPLIER, LOWBALL_YARD);

  assert.ok(
    premiumResult.totalHigh > lowballResult.totalHigh,
    `Premium yard (${premiumResult.totalHigh}) should beat lowball (${lowballResult.totalHigh})`,
  );
});

// ---------------------------------------------------------------------------
// METAL_ALIASES completeness spot-checks
// ---------------------------------------------------------------------------

test('METAL_ALIASES contains at least 10 EV/battery entries', () => {
  const evEntries = Object.entries(METAL_ALIASES).filter(
    ([, v]) =>
      v === 'li_ion_module' ||
      v === 'ev_copper_busbar' ||
      v === 'nmc_black_mass' ||
      v === 'lfp_black_mass' ||
      v === 'pcb_high_grade' ||
      v === 'pcb_low_grade' ||
      v === 'cobalt_sulfate' ||
      v === 'nickel_briquette',
  );
  assert.ok(evEntries.length >= 10, `Expected ≥ 10 EV/battery aliases, found ${evEntries.length}`);
});
