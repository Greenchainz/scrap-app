import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  distanceMiles,
  findNearbyYards,
  findYardsByCity,
  findYardsByState,
  getSampleYards,
  SEED_YARDS,
  type ScrapYard,
} from './yards';

// ---------------------------------------------------------------------------
// distanceMiles — haversine accuracy
// ---------------------------------------------------------------------------

test('distanceMiles returns 0 for identical coordinates', () => {
  assert.equal(distanceMiles(40.7128, -74.006, 40.7128, -74.006), 0);
});

test('distanceMiles NYC to LA is roughly 2445 miles', () => {
  // Known great-circle: ~2444–2448 mi
  const d = distanceMiles(40.7128, -74.006, 34.0522, -118.2437);
  assert.ok(d >= 2440 && d <= 2460, `Expected ~2445 mi, got ${d}`);
});

test('distanceMiles is symmetric', () => {
  const ab = distanceMiles(40.7128, -74.006, 41.8781, -87.6298);
  const ba = distanceMiles(41.8781, -87.6298, 40.7128, -74.006);
  assert.equal(ab.toFixed(2), ba.toFixed(2));
});

test('distanceMiles NYC to Chicago is roughly 710–730 miles', () => {
  const d = distanceMiles(40.7128, -74.006, 41.8781, -87.6298);
  assert.ok(d >= 700 && d <= 740, `Expected ~713 mi, got ${d}`);
});

// ---------------------------------------------------------------------------
// findNearbyYards — ordering by distance
// ---------------------------------------------------------------------------

test('findNearbyYards returns results sorted by distance ascending', () => {
  // Stand in Midtown Manhattan
  const yards = findNearbyYards(40.7549, -73.984, 10);
  assert.ok(yards.length > 0);
  for (let i = 1; i < yards.length; i++) {
    assert.ok(
      yards[i]!.distanceMiles >= yards[i - 1]!.distanceMiles,
      `Yards not sorted: index ${i - 1} dist=${yards[i - 1]!.distanceMiles} > index ${i} dist=${yards[i]!.distanceMiles}`,
    );
  }
});

test('findNearbyYards from NYC returns NYC yards near the top', () => {
  const yards = findNearbyYards(40.7128, -74.006, 5);
  // All 5 nearest to NYC should have state NY or NJ proximity
  const topStates = yards.map((y) => y.state);
  assert.ok(topStates.includes('NY'), 'Expected at least one NY yard in top 5 nearest to NYC');
});

test('findNearbyYards from LA returns CA yards near the top', () => {
  const yards = findNearbyYards(34.0522, -118.2437, 5);
  const topStates = yards.map((y) => y.state);
  assert.ok(topStates.includes('CA'), 'Expected at least one CA yard in top 5 nearest to LA');
});

test('findNearbyYards respects the limit parameter', () => {
  const three = findNearbyYards(40.7128, -74.006, 3);
  assert.equal(three.length, 3);
});

test('findNearbyYards attaches numeric distanceMiles to each result', () => {
  const yards = findNearbyYards(39.9612, -82.9988, 5);
  for (const yard of yards) {
    assert.equal(typeof yard.distanceMiles, 'number');
    assert.ok(yard.distanceMiles >= 0);
  }
});

// ---------------------------------------------------------------------------
// findYardsByCity
// ---------------------------------------------------------------------------

test('findYardsByCity returns yards for New York City', () => {
  const yards = findYardsByCity('New York City');
  assert.ok(yards.length >= 3, `Expected ≥ 3 NYC yards, got ${yards.length}`);
  for (const yard of yards) {
    assert.equal(yard.state, 'NY');
  }
});

test('findYardsByCity is case-insensitive', () => {
  const upper = findYardsByCity('CHICAGO');
  const lower = findYardsByCity('chicago');
  assert.equal(upper.length, lower.length);
  assert.ok(upper.length >= 3);
});

test('findYardsByCity uses substring matching', () => {
  // "Los" should match "Los Angeles"
  const yards = findYardsByCity('Los');
  assert.ok(yards.length >= 3);
  for (const yard of yards) {
    assert.ok(yard.city.toLowerCase().includes('los'));
  }
});

test('findYardsByCity returns empty array for unknown city', () => {
  const yards = findYardsByCity('Atlantis');
  assert.equal(yards.length, 0);
});

test('findYardsByCity returns Houston yards', () => {
  const yards = findYardsByCity('Houston');
  assert.ok(yards.length >= 2);
  for (const yard of yards) {
    assert.equal(yard.state, 'TX');
  }
});

// ---------------------------------------------------------------------------
// findYardsByState
// ---------------------------------------------------------------------------

test('findYardsByState returns NY yards', () => {
  const yards = findYardsByState('NY');
  assert.ok(yards.length >= 3);
  for (const yard of yards) {
    assert.equal(yard.state, 'NY');
  }
});

test('findYardsByState is case-insensitive', () => {
  const upper = findYardsByState('CA');
  const lower = findYardsByState('ca');
  assert.equal(upper.length, lower.length);
});

test('findYardsByState returns empty for unknown state', () => {
  const yards = findYardsByState('ZZ');
  assert.equal(yards.length, 0);
});

// ---------------------------------------------------------------------------
// getSampleYards — national sample
// ---------------------------------------------------------------------------

test('getSampleYards returns a non-empty list', () => {
  const yards = getSampleYards();
  assert.ok(yards.length >= 5);
});

test('getSampleYards spans multiple states', () => {
  const yards = getSampleYards();
  const states = new Set(yards.map((y) => y.state));
  assert.ok(states.size >= 4, `Expected ≥ 4 states in national sample, got ${states.size}`);
});

// ---------------------------------------------------------------------------
// SEED_YARDS integrity
// ---------------------------------------------------------------------------

test('all SEED_YARDS have valid structure', () => {
  for (const yard of SEED_YARDS) {
    assert.ok(yard.id, `Missing id on yard`);
    assert.ok(yard.name, `Missing name on ${yard.id}`);
    assert.ok(yard.city, `Missing city on ${yard.id}`);
    assert.ok(yard.state.length === 2, `State must be 2-char on ${yard.id}`);
    assert.ok(yard.latitude >= -90 && yard.latitude <= 90, `Bad latitude on ${yard.id}`);
    assert.ok(yard.longitude >= -180 && yard.longitude <= 180, `Bad longitude on ${yard.id}`);
    assert.ok(yard.payoutFactor > 0 && yard.payoutFactor <= 1.5, `Bad payoutFactor on ${yard.id}`);
  }
});

test('SEED_YARDS have unique ids', () => {
  const ids = SEED_YARDS.map((y: ScrapYard) => y.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, 'Duplicate yard IDs found');
});

test('SEED_YARDS payoutFactor spread is wide enough to be meaningful', () => {
  const factors = SEED_YARDS.map((y) => y.payoutFactor);
  const min = Math.min(...factors);
  const max = Math.max(...factors);
  assert.ok(max - min >= 0.15, `payoutFactor spread too narrow: ${min}–${max}`);
});
