import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyBatteryEraFromYear,
  getBatteryProfile,
  decodeBatteryPackId,
  type BatteryChemistryEra,
} from './era';

// ---------------------------------------------------------------------------
// classifyBatteryEraFromYear — boundary tests
// ---------------------------------------------------------------------------

test('classifyBatteryEraFromYear boundaries', () => {
  assert.equal(classifyBatteryEraFromYear(1990), 'lead_acid');
  assert.equal(classifyBatteryEraFromYear(1999), 'lead_acid');
  assert.equal(classifyBatteryEraFromYear(2000), 'early_liion');
  assert.equal(classifyBatteryEraFromYear(2012), 'early_liion');
  assert.equal(classifyBatteryEraFromYear(2013), 'nmc_era');
  assert.equal(classifyBatteryEraFromYear(2020), 'nmc_era');
  assert.equal(classifyBatteryEraFromYear(2021), 'lfp_era');
  assert.equal(classifyBatteryEraFromYear(2026), 'lfp_era');
  assert.equal(classifyBatteryEraFromYear(2027), 'passport_2027');
  assert.equal(classifyBatteryEraFromYear(2030), 'passport_2027');
});

test('classifyBatteryEraFromYear covers the full expected BatteryChemistryEra union', () => {
  const expected: BatteryChemistryEra[] = ['lead_acid', 'early_liion', 'nmc_era', 'lfp_era', 'passport_2027'];
  const testYears = [1985, 2005, 2018, 2023, 2028];
  const results = testYears.map(classifyBatteryEraFromYear);
  assert.deepEqual(results, expected);
});

// ---------------------------------------------------------------------------
// getBatteryProfile — returns the right profile
// ---------------------------------------------------------------------------

test('getBatteryProfile for 2018 (NMC era) has correct fields', () => {
  const profile = getBatteryProfile(2018);
  assert.equal(profile.era, 'nmc_era');
  assert.ok(profile.label.length > 0);
  assert.ok(profile.recoverableMetals.length > 0);
  assert.ok(profile.recoverableMetals.includes('nmc_black_mass'));
  assert.ok(profile.recoverableMetals.includes('cobalt_sulfate'));
  assert.ok(profile.complianceNote.length > 0);
});

test('getBatteryProfile for 2027+ has Digital Battery Passport compliance note', () => {
  const profile = getBatteryProfile(2027);
  assert.equal(profile.era, 'passport_2027');
  // Must mention the EU regulation and passport
  assert.ok(
    profile.complianceNote.toLowerCase().includes('passport'),
    `Expected 'passport' in complianceNote, got: ${profile.complianceNote}`,
  );
  assert.ok(
    profile.complianceNote.includes('2027'),
    `Expected '2027' in complianceNote, got: ${profile.complianceNote}`,
  );
});

test('getBatteryProfile for 2023 (LFP era) includes lfp recoverable metals', () => {
  const profile = getBatteryProfile(2023);
  assert.equal(profile.era, 'lfp_era');
  assert.ok(profile.recoverableMetals.includes('lfp_black_mass'));
});

test('getBatteryProfile for 1995 (lead acid) has safety note', () => {
  const profile = getBatteryProfile(1995);
  assert.equal(profile.era, 'lead_acid');
  assert.ok(profile.valueDensityNote.length > 0);
});

test('all battery profiles have non-empty required fields', () => {
  const testYears = [1990, 2005, 2016, 2024, 2028];
  for (const year of testYears) {
    const profile = getBatteryProfile(year);
    assert.ok(profile.era, `era missing for year ${year}`);
    assert.ok(profile.label, `label missing for year ${year}`);
    assert.ok(profile.yearsLabel, `yearsLabel missing for year ${year}`);
    assert.ok(profile.dominantChemistry, `dominantChemistry missing for year ${year}`);
    assert.ok(profile.recoverableMetals.length > 0, `recoverableMetals empty for year ${year}`);
    assert.ok(profile.valueDensityNote, `valueDensityNote missing for year ${year}`);
    assert.ok(profile.complianceNote, `complianceNote missing for year ${year}`);
  }
});

// ---------------------------------------------------------------------------
// decodeBatteryPackId — VIN + embedded year
// ---------------------------------------------------------------------------

test('decodeBatteryPackId decodes a 17-char VIN with year code D at pos 9 (2013 = NMC era)', () => {
  // Standard 17-char VIN, position index 9 = 'D' → 2013
  const vin = '5YJSA1H19DFP12345';
  const result = decodeBatteryPackId(vin);
  assert.equal(result.year, 2013);
  assert.equal(result.chemistryEra, 'nmc_era');
  assert.ok(result.profile != null);
  assert.equal(result.confidence, 'high');
});

test('decodeBatteryPackId decodes a 17-char VIN year code L at pos 9 (2020 = NMC era)', () => {
  // Position 9 = 'L' → 2020
  const vin = '5YJSA1E26LF123456';
  const result = decodeBatteryPackId(vin);
  assert.equal(result.year, 2020);
  assert.equal(result.chemistryEra, 'nmc_era');
});

test('decodeBatteryPackId falls back to embedded 4-digit year', () => {
  // Not a 17-char VIN but contains 2022
  const packId = 'TESLA-PACK-2022-ABCD';
  const result = decodeBatteryPackId(packId);
  assert.equal(result.year, 2022);
  assert.equal(result.chemistryEra, 'lfp_era');
  assert.equal(result.confidence, 'medium');
});

test('decodeBatteryPackId returns low confidence for unresolvable ID', () => {
  const result = decodeBatteryPackId('XXXXX');
  assert.equal(result.year, null);
  assert.equal(result.chemistryEra, null);
  assert.equal(result.profile, null);
  assert.equal(result.confidence, 'low');
});

test('decodeBatteryPackId 2027 VIN → passport_2027 era', () => {
  // Position 9 = 'V' → 2027
  const vin = '5YJSA1E26VF123456';
  const result = decodeBatteryPackId(vin);
  assert.equal(result.year, 2027);
  assert.equal(result.chemistryEra, 'passport_2027');
  assert.ok(result.profile?.complianceNote.includes('2027'));
});
