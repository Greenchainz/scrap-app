import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMetalType, calculateMetalValue } from './pricing';

test('normalizeMetalType resolves EV battery aliases', () => {
  assert.equal(normalizeMetalType('battery pack'), 'li_ion_pack');
  assert.equal(normalizeMetalType('LFP battery'), 'lfp_pack');
  assert.equal(normalizeMetalType('NMC module'), 'nmc_pack');
  assert.equal(normalizeMetalType('copper busbar'), 'ev_copper_busbar');
});

test('normalizeMetalType resolves battery commodity metals', () => {
  assert.equal(normalizeMetalType('lithium black mass'), 'lithium_black_mass');
  assert.equal(normalizeMetalType('cobalt concentrate'), 'cobalt_black_mass');
  assert.equal(normalizeMetalType('nickel recovery stream'), 'nickel_black_mass');
});

test('calculateMetalValue prices EV battery grades', () => {
  const value = calculateMetalValue('NMC battery', '10-12 lbs', 1);
  assert.equal(value.valueLow, 21);
  assert.equal(value.valueHigh, 52.8);
});
