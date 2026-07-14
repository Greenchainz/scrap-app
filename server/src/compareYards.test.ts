import { test } from 'node:test';
import assert from 'node:assert/strict';

// We test the pure logic extracted from the router directly, since tRPC
// procedures run in a DB-connected server context. The router logic is thin
// (it delegates to yards.ts + pricing.ts) so we test the underlying helpers
// and verify ordering invariants.

import {
  findNearbyYards,
  findYardsByCity,
  findYardsByState,
  getSampleYards,
} from './yards';
import { calculateTotalValueAtYard } from './pricing';
import { getRegionalMultiplier } from './pricing';

// ---------------------------------------------------------------------------
// Fixture metals for deterministic tests
// ---------------------------------------------------------------------------

const SIMPLE_METALS = [
  { type: 'copper_bare_bright', weightRange: '5-10 lbs', percentage: 60 },
  { type: 'aluminum_clean', weightRange: '10-15 lbs', percentage: 40 },
];

const EV_METALS = [
  { type: 'nmc_black_mass', weightRange: '20-40 lbs', percentage: 70 },
  { type: 'ev_copper_busbar', weightRange: '5-10 lbs', percentage: 30 },
];

// ---------------------------------------------------------------------------
// Helper: simulate compareYards logic
// ---------------------------------------------------------------------------

function compareYards(
  metals: typeof SIMPLE_METALS,
  options: { latitude?: number; longitude?: number; state?: string; limit?: number },
) {
  const { latitude, longitude, state, limit = 8 } = options;

  let candidateYards: ReturnType<typeof getSampleYards>;
  if (latitude != null && longitude != null) {
    candidateYards = findNearbyYards(latitude, longitude, Math.max(limit, 20));
  } else if (state) {
    candidateYards = findYardsByState(state);
    if (candidateYards.length === 0) candidateYards = getSampleYards();
  } else {
    candidateYards = getSampleYards();
  }

  const results = candidateYards.map((yard) => {
    const yardStateMultiplier = getRegionalMultiplier(yard.state);
    const { totalLow, totalHigh } = calculateTotalValueAtYard(metals, yardStateMultiplier, yard);
    return { yard, totalLow, totalHigh };
  });

  results.sort((a, b) => b.totalHigh - a.totalHigh);
  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// compareYards — ordering invariants
// ---------------------------------------------------------------------------

test('compareYards returns results sorted by totalHigh descending (best payout first)', () => {
  const results = compareYards(SIMPLE_METALS, { state: 'NY' });
  assert.ok(results.length > 0);
  for (let i = 1; i < results.length; i++) {
    assert.ok(
      results[i]!.totalHigh <= results[i - 1]!.totalHigh,
      `Result at index ${i} (${results[i]!.totalHigh}) should be ≤ index ${i - 1} (${results[i - 1]!.totalHigh})`,
    );
  }
});

test('compareYards with coords returns yards from nearby metros first (sorted by payout, not distance)', () => {
  // With coords near NYC, the yard list is drawn from nearby yards.
  // The results should still be sorted by payout, NOT distance.
  const results = compareYards(SIMPLE_METALS, { latitude: 40.7128, longitude: -74.006 });
  assert.ok(results.length > 0);
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i]!.totalHigh <= results[i - 1]!.totalHigh);
  }
});

test('compareYards with state=IL returns IL yards', () => {
  const results = compareYards(SIMPLE_METALS, { state: 'IL' });
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.equal(r.yard.state, 'IL', `Expected IL yard, got ${r.yard.state}`);
  }
});

test('compareYards without coords or state returns national sample', () => {
  const results = compareYards(SIMPLE_METALS, {});
  const states = new Set(results.map((r) => r.yard.state));
  assert.ok(states.size >= 3, `Expected ≥ 3 states in national sample, got ${states.size}`);
});

test('compareYards all totalHigh values are positive for copper haul', () => {
  const results = compareYards(SIMPLE_METALS, { state: 'TX' });
  for (const r of results) {
    assert.ok(r.totalHigh > 0, `Expected positive payout, got ${r.totalHigh} at ${r.yard.name}`);
  }
});

test('compareYards respects limit parameter', () => {
  const five = compareYards(SIMPLE_METALS, { state: 'TX', limit: 5 });
  const three = compareYards(SIMPLE_METALS, { state: 'TX', limit: 3 });
  // Limit may be capped by available yards for a state
  assert.ok(five.length <= 5);
  assert.ok(three.length <= 3);
});

test('compareYards with EV metals returns higher payouts than the same weight in light iron', () => {
  const lightIronMetals = [
    { type: 'light_iron', weightRange: '20-40 lbs', percentage: 70 },
    { type: 'light_iron', weightRange: '5-10 lbs', percentage: 30 },
  ];

  const evResults = compareYards(EV_METALS, {});
  const ironResults = compareYards(lightIronMetals, {});

  // Best EV payout should exceed best iron payout (NMC black mass >> light iron per lb)
  assert.ok(
    evResults[0]!.totalHigh > ironResults[0]!.totalHigh,
    `EV payout (${evResults[0]!.totalHigh}) should exceed iron payout (${ironResults[0]!.totalHigh})`,
  );
});

// ---------------------------------------------------------------------------
// estimateInCity — simulate the procedure logic
// ---------------------------------------------------------------------------

function estimateInCity(metals: typeof SIMPLE_METALS, city: string) {
  const cityYards = findYardsByCity(city);
  if (cityYards.length === 0) return { yards: [], cityBestPayout: { totalLow: 0, totalHigh: 0 }, city };

  const results = cityYards.map((yard) => {
    const yardStateMultiplier = getRegionalMultiplier(yard.state);
    const { totalLow, totalHigh } = calculateTotalValueAtYard(metals, yardStateMultiplier, yard);
    return { yard, totalLow, totalHigh };
  });

  results.sort((a, b) => b.totalHigh - a.totalHigh);
  const cityBestPayout = results[0]
    ? { totalLow: results[0].totalLow, totalHigh: results[0].totalHigh }
    : { totalLow: 0, totalHigh: 0 };

  return { yards: results, cityBestPayout, city };
}

test('estimateInCity for NYC returns NYC yards only', () => {
  const result = estimateInCity(SIMPLE_METALS, 'New York City');
  assert.ok(result.yards.length >= 2, 'Expected ≥ 2 NYC yards');
  for (const r of result.yards) {
    assert.equal(r.yard.state, 'NY');
  }
});

test('estimateInCity NYC returns results sorted by totalHigh descending', () => {
  const result = estimateInCity(SIMPLE_METALS, 'New York City');
  for (let i = 1; i < result.yards.length; i++) {
    assert.ok(result.yards[i]!.totalHigh <= result.yards[i - 1]!.totalHigh);
  }
});

test('estimateInCity cityBestPayout equals the first (highest) yard payout', () => {
  const result = estimateInCity(SIMPLE_METALS, 'Los Angeles');
  assert.ok(result.yards.length > 0);
  assert.equal(result.cityBestPayout.totalHigh, result.yards[0]!.totalHigh);
});

test('estimateInCity for unknown city returns empty yards and zero payout', () => {
  const result = estimateInCity(SIMPLE_METALS, 'Atlantis');
  assert.equal(result.yards.length, 0);
  assert.equal(result.cityBestPayout.totalLow, 0);
  assert.equal(result.cityBestPayout.totalHigh, 0);
});

test('estimateInCity Chicago returns Chicago yards', () => {
  const result = estimateInCity(SIMPLE_METALS, 'Chicago');
  assert.ok(result.yards.length >= 2);
  for (const r of result.yards) {
    assert.equal(r.yard.state, 'IL');
  }
});

test('estimateInCity different cities produce different best payouts (NY vs rural WV)', () => {
  const nyc = estimateInCity(SIMPLE_METALS, 'New York City');
  const wv = estimateInCity(SIMPLE_METALS, 'Charleston');
  // NY (multiplier 1.10) should beat WV (0.85) for the same metals
  assert.ok(
    nyc.cityBestPayout.totalHigh > wv.cityBestPayout.totalHigh,
    `NYC (${nyc.cityBestPayout.totalHigh}) should beat WV (${wv.cityBestPayout.totalHigh})`,
  );
});
