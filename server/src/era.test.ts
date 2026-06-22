import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeBrand,
  decodeSerialNumber,
  getEpochForYear,
  getEraProfile,
  describeEra,
  type DecodedDate,
} from './era';

const NOW_PLUS_ONE = new Date().getFullYear() + 1;

// --- normalizeBrand -------------------------------------------------------

test('normalizeBrand maps known brand families', () => {
  assert.equal(normalizeBrand('GE'), 'ge');
  assert.equal(normalizeBrand('General Electric'), 'ge');
  assert.equal(normalizeBrand('Hotpoint'), 'ge');
  assert.equal(normalizeBrand('Whirlpool'), 'whirlpool');
  assert.equal(normalizeBrand('Maytag'), 'whirlpool');
  assert.equal(normalizeBrand('KitchenAid'), 'whirlpool');
  assert.equal(normalizeBrand('Amana'), 'whirlpool');
  assert.equal(normalizeBrand('Frigidaire'), 'frigidaire');
  assert.equal(normalizeBrand('Electrolux'), 'frigidaire');
  assert.equal(normalizeBrand('Samsung'), 'samsung');
  assert.equal(normalizeBrand('Tesla'), 'ev');
  assert.equal(normalizeBrand('CATL'), 'ev');
});

test('normalizeBrand returns unknown for unrecognized brands', () => {
  assert.equal(normalizeBrand('Bosch'), 'unknown');
  assert.equal(normalizeBrand(''), 'unknown');
});

// --- decodeSerialNumber: guards ------------------------------------------

test('decodeSerialNumber reports missing serial', () => {
  const decoded = decodeSerialNumber('GE', '   ');
  assert.equal(decoded.year, null);
  assert.equal(decoded.confidence, 'low');
  assert.match(decoded.note ?? '', /No serial number/i);
});

test('decodeSerialNumber reports unsupported brand', () => {
  const decoded = decodeSerialNumber('Bosch', 'ABC123');
  assert.equal(decoded.brand, 'unknown');
  assert.equal(decoded.year, null);
  assert.match(decoded.note ?? '', /Unsupported brand/i);
});

// --- decodeSerialNumber: GE / Hotpoint -----------------------------------

test('decodeSerialNumber decodes GE month + cyclic year', () => {
  // First char = month (H -> 5), second char = year letter (M -> 12-year cycle).
  const decoded = decodeSerialNumber('GE', 'HM123456');
  const candidates = [1983, 1995, 2007, 2019];
  const expectedYear = Math.max(...candidates.filter((y) => y <= NOW_PLUS_ONE));

  assert.equal(decoded.brand, 'ge');
  assert.equal(decoded.month, 5);
  assert.deepEqual(decoded.candidateYears, candidates);
  assert.equal(decoded.year, expectedYear);
  assert.equal(decoded.confidence, 'medium');
  assert.match(decoded.note ?? '', /repeats every 12 years/i);
});

test('decodeSerialNumber is case-insensitive for GE serials', () => {
  assert.deepEqual(decodeSerialNumber('GE', 'hm123456'), decodeSerialNumber('GE', 'HM123456'));
});

// --- decodeSerialNumber: Whirlpool family --------------------------------

test('decodeSerialNumber decodes Whirlpool year from 3rd-from-end char', () => {
  // 'G' (3rd from end) -> 2017.
  const decoded = decodeSerialNumber('Whirlpool', 'CT4805G15');
  assert.equal(decoded.brand, 'whirlpool');
  assert.equal(decoded.year, 2017);
  assert.equal(decoded.month, null);
  assert.equal(decoded.confidence, 'high');
});

test('decodeSerialNumber routes Maytag through the Whirlpool decoder', () => {
  const decoded = decodeSerialNumber('Maytag', 'CT4805G15');
  assert.equal(decoded.brand, 'whirlpool');
  assert.equal(decoded.year, 2017);
});

test('decodeSerialNumber flags unresolved Whirlpool codes', () => {
  // '1' is not a valid Whirlpool year char.
  const decoded = decodeSerialNumber('Whirlpool', 'CT4805115');
  assert.equal(decoded.year, null);
  assert.equal(decoded.confidence, 'low');
});

// --- decodeSerialNumber: Frigidaire --------------------------------------

test('decodeSerialNumber decodes Frigidaire decade digit + week', () => {
  // Leading factory letters, then last-digit-of-year (1), then 2-digit week (23).
  const decoded = decodeSerialNumber('Frigidaire', 'BA1234567');
  assert.equal(decoded.brand, 'frigidaire');
  assert.notEqual(decoded.year, null);
  assert.equal((decoded.year as number) % 10, 1);
  assert.ok((decoded.year as number) <= NOW_PLUS_ONE);
  assert.ok(decoded.month != null && decoded.month >= 1 && decoded.month <= 12);
});

test('decodeSerialNumber flags unparseable Frigidaire serials', () => {
  const decoded = decodeSerialNumber('Frigidaire', 'NODIGITSHERE');
  assert.equal(decoded.year, null);
  assert.equal(decoded.confidence, 'low');
});

// --- decodeSerialNumber: Samsung -----------------------------------------

test('decodeSerialNumber decodes an 11-char Samsung serial', () => {
  // length 11 -> year char at index 3 (G -> 2015), month char at index 4 (A -> 10).
  const decoded = decodeSerialNumber('Samsung', 'ABCGA678901');
  assert.equal(decoded.brand, 'samsung');
  assert.equal(decoded.year, 2015);
  assert.equal(decoded.month, 10);
  assert.equal(decoded.confidence, 'high');
});

test('decodeSerialNumber decodes EV VIN model year and chemistry hints', () => {
  const decoded = decodeSerialNumber('Tesla', '5YJ3E1EA7PF123456');
  assert.equal(decoded.identifierType, 'vin');
  assert.equal(decoded.manufacturer, 'Tesla');
  assert.equal(decoded.year, 2023);
  assert.equal(decoded.chemistry, 'unknown');
  assert.equal(decoded.batteryEra, 'passport_transition');
});

test('decodeSerialNumber decodes battery serial chemistry and date clues', () => {
  const decoded = decodeSerialNumber('CATL', 'CATL-LFP-202311-BLOCK9');
  assert.equal(decoded.identifierType, 'battery_serial');
  assert.equal(decoded.chemistry, 'LFP');
  assert.equal(decoded.year, 2023);
  assert.equal(decoded.month, 11);
  assert.equal(decoded.batteryEra, 'passport_transition');
});

// --- getEpochForYear: boundaries -----------------------------------------

test('getEpochForYear classifies each epoch at its boundaries', () => {
  assert.equal(getEpochForYear(1979), 'heavy_iron');
  assert.equal(getEpochForYear(1980), 'polymer_shift');
  assert.equal(getEpochForYear(2004), 'polymer_shift');
  assert.equal(getEpochForYear(2005), 'high_efficiency');
  assert.equal(getEpochForYear(2019), 'high_efficiency');
  assert.equal(getEpochForYear(2020), 'smart_ie5');
  assert.equal(getEpochForYear(2026), 'smart_ie5');
});

test('getEraProfile returns a profile matching the epoch', () => {
  const profile = getEraProfile(1975);
  assert.equal(profile.epoch, 'heavy_iron');
  assert.equal(profile.motorWinding, 'copper');
  assert.ok(profile.insights.length > 0);
  assert.ok(profile.washerWeightLbs.low <= profile.washerWeightLbs.high);
});

// --- describeEra ----------------------------------------------------------

test('describeEra returns null when the year is unknown', () => {
  const decoded: DecodedDate = {
    brand: 'ge',
    year: null,
    month: null,
    candidateYears: [],
    confidence: 'low',
  };
  assert.equal(describeEra(decoded), null);
});

test('describeEra maps a decoded year to its era profile', () => {
  const decoded: DecodedDate = {
    brand: 'samsung',
    year: 2022,
    month: 3,
    candidateYears: [2022],
    confidence: 'high',
  };
  const profile = describeEra(decoded);
  assert.ok(profile);
  assert.equal(profile?.epoch, 'smart_ie5');
});
