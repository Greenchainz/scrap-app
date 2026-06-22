import { z } from 'zod';
import type { ScrapYard } from './yards';

export const MetalSchema = z.object({
  type: z.string(),
  weightRange: z.string(),
  percentage: z.number(),
  valueLow: z.number(),
  valueHigh: z.number(),
});

export const ScrapAnalysisSchema = z.object({
  objectName: z.string(),
  metals: z.array(MetalSchema),
  extractionSteps: z.array(z.string()),
  difficulty: z.enum(['easy', 'moderate', 'hard']),
  safetyWarnings: z.array(z.string()),
});

export type Metal = z.infer<typeof MetalSchema>;
export type ScrapAnalysis = z.infer<typeof ScrapAnalysisSchema>;

export type PriceRange = { low: number; high: number };

// 2026 scrap-yard payout baseline (USD per lb) for optimally prepared material.
// Ranges reflect typical national low/high spreads at U.S. yards.
// NOTE: bronze is an estimate (positioned just under yellow brass); the 2026
// source matrices do not list an exact bronze figure.
export const METAL_PRICES: Record<string, PriceRange> = {
  copper_bare_bright: { low: 5.30, high: 5.50 },
  copper_1: { low: 5.00, high: 5.20 },
  copper_2: { low: 4.75, high: 5.05 },
  copper_icw: { low: 1.95, high: 2.90 },
  acr: { low: 1.55, high: 2.65 },
  yellow_brass: { low: 2.40, high: 3.05 },
  bronze: { low: 2.30, high: 2.95 },
  aluminum_clean: { low: 0.55, high: 1.25 },
  stainless: { low: 0.40, high: 0.90 },
  electric_motor: { low: 0.15, high: 0.55 },
  sealed_unit: { low: 0.15, high: 0.35 },
  light_iron: { low: 0.08, high: 0.11 },
  li_ion_pack: { low: 1.2, high: 2.4 },
  lfp_pack: { low: 0.8, high: 1.9 },
  nmc_pack: { low: 2.1, high: 4.4 },
  nca_pack: { low: 1.9, high: 4.1 },
  battery_module_mixed: { low: 0.9, high: 2.2 },
  lithium_black_mass: { low: 0.7, high: 1.7 },
  cobalt_black_mass: { low: 4.5, high: 8.2 },
  nickel_black_mass: { low: 2.8, high: 5.6 },
  ev_copper_busbar: { low: 4.9, high: 5.3 },

  // --- EV / Battery grades (2026 baselines, USD per lb) -------------------
  // EV copper busbars are heavier-gauge, cleaner copper than typical ICW.
  // Priced near copper_1 due to purity but slight discount for size/prep work.
  ev_copper_busbar: { low: 4.60, high: 5.10 },

  // Whole Li-ion module (cells + BMS + housing, NOT separated). Value is
  // blended: recoverable Li, Co, Ni, Cu, Al spread across module mass.
  // NOTE: cell chemistry matters — NMC modules pay more than LFP due to Co/Ni.
  // FUTURE SEAM: replace with live LME/metals-price feed when available.
  li_ion_module: { low: 0.30, high: 0.75 },

  // Black mass — shredded/processed battery material ready for hydromet.
  // NMC black mass carries Co+Ni premium vs LFP which lacks those metals.
  // FUTURE SEAM: these swing violently with LME Co/Ni — prime candidates for live feed.
  nmc_black_mass: { low: 2.80, high: 4.50 },
  lfp_black_mass: { low: 0.55, high: 1.10 },

  // Nickel briquette / refined Ni — e.g. from NiMH packs or refined EV streams.
  nickel_briquette: { low: 5.50, high: 6.80 },

  // Cobalt sulfate — chemical-grade Co from NMC teardown. Extremely volatile price.
  // FUTURE SEAM: cobalt is the #1 candidate for live price feed integration.
  cobalt_sulfate: { low: 8.00, high: 14.00 },

  // Circuit boards / e-waste. Prices reflect blended Au/Ag/Pd/Cu recovery.
  // High-grade = server boards, GPU cards, telecom. Low-grade = consumer mainboards.
  pcb_high_grade: { low: 3.50, high: 7.00 },
  pcb_low_grade: { low: 0.80, high: 2.20 },
};

// Maps free-text metal names (including AI output) to a canonical grade key above.
export const METAL_ALIASES: Record<string, string> = {
  'bare bright': 'copper_bare_bright',
  'bare bright copper': 'copper_bare_bright',
  '#1 copper': 'copper_1',
  'number 1 copper': 'copper_1',
  'copper tubing': 'copper_1',
  '#2 copper': 'copper_2',
  'number 2 copper': 'copper_2',
  copper: 'copper_2',
  'insulated copper wire': 'copper_icw',
  icw: 'copper_icw',
  'copper wire': 'copper_icw',
  'aluminum copper radiator': 'acr',
  radiator: 'acr',
  'yellow brass': 'yellow_brass',
  brass: 'yellow_brass',
  aluminum: 'aluminum_clean',
  aluminium: 'aluminum_clean',
  'cast aluminum': 'aluminum_clean',
  'stainless steel': 'stainless',
  'electric motor': 'electric_motor',
  motor: 'electric_motor',
  'sealed unit': 'sealed_unit',
  compressor: 'sealed_unit',
  steel: 'light_iron',
  'light iron': 'light_iron',
  shred: 'light_iron',
  iron: 'light_iron',
  'cast iron': 'light_iron',
  tin: 'light_iron',
  'li-ion': 'li_ion_pack',
  'li ion': 'li_ion_pack',
  'li-ion battery': 'li_ion_pack',
  'lithium ion battery': 'li_ion_pack',
  'traction battery': 'li_ion_pack',
  'ev battery': 'li_ion_pack',
  'battery pack': 'li_ion_pack',
  'ev battery pack': 'li_ion_pack',
  'battery module': 'battery_module_mixed',
  module: 'battery_module_mixed',
  'battery cell': 'battery_module_mixed',
  cell: 'battery_module_mixed',
  'lfp battery': 'lfp_pack',
  lfp: 'lfp_pack',
  'nmc battery': 'nmc_pack',
  nmc: 'nmc_pack',
  nca: 'nca_pack',
  'nca battery': 'nca_pack',
  lithium: 'lithium_black_mass',
  'lithium black mass': 'lithium_black_mass',
  cobalt: 'cobalt_black_mass',
  'cobalt black mass': 'cobalt_black_mass',
  nickel: 'nickel_black_mass',
  'nickel black mass': 'nickel_black_mass',
  busbar: 'ev_copper_busbar',
  'copper busbar': 'ev_copper_busbar',
  'bus bar copper': 'ev_copper_busbar',
  'hairpin copper': 'ev_copper_busbar',
  'high voltage copper cable': 'copper_icw',
  'hv copper cable': 'copper_icw',

  // --- EV / battery aliases ------------------------------------------------
  'ev battery': 'li_ion_module',
  'ev battery module': 'li_ion_module',
  'battery module': 'li_ion_module',
  'battery pack': 'li_ion_module',
  'lithium ion module': 'li_ion_module',
  'lithium-ion module': 'li_ion_module',
  'li-ion module': 'li_ion_module',
  'lithium battery': 'li_ion_module',
  'lithium ion battery': 'li_ion_module',
  'lithium-ion battery': 'li_ion_module',
  'nmc module': 'li_ion_module',
  'lfp module': 'li_ion_module',
  'black mass': 'nmc_black_mass',
  'nmc black mass': 'nmc_black_mass',
  'lfp black mass': 'lfp_black_mass',
  'lifepo4 black mass': 'lfp_black_mass',
  busbar: 'ev_copper_busbar',
  busbars: 'ev_copper_busbar',
  'ev busbar': 'ev_copper_busbar',
  'ev copper busbar': 'ev_copper_busbar',
  'copper busbar': 'ev_copper_busbar',
  nickel: 'nickel_briquette',
  'nickel briquette': 'nickel_briquette',
  cobalt: 'cobalt_sulfate',
  'cobalt sulfate': 'cobalt_sulfate',

  // --- E-waste / circuit board aliases -------------------------------------
  'circuit board': 'pcb_high_grade',
  'circuit boards': 'pcb_high_grade',
  pcb: 'pcb_high_grade',
  pcbs: 'pcb_high_grade',
  motherboard: 'pcb_high_grade',
  'mother board': 'pcb_high_grade',
  'server board': 'pcb_high_grade',
  'graphics card': 'pcb_high_grade',
  gpu: 'pcb_high_grade',
  'bms board': 'pcb_high_grade',
  'battery management system': 'pcb_high_grade',
  'low grade pcb': 'pcb_low_grade',
  'low-grade pcb': 'pcb_low_grade',
  'consumer pcb': 'pcb_low_grade',
};

// Resolves any free-text metal label to a canonical grade key, or null if unknown.
export function normalizeMetalType(metalType: string): string | null {
  const key = metalType.trim().toLowerCase();
  const has = (pattern: RegExp): boolean => pattern.test(key);
  if (METAL_PRICES[key]) return key;
  if (METAL_ALIASES[key]) return METAL_ALIASES[key]!;
  if (key.includes('bare bright')) return 'copper_bare_bright';
  if (key.includes('icw') || key.includes('insulated copper')) return 'copper_icw';
  if (key.includes('acr') || key.includes('radiator')) return 'acr';
  if (key.includes('brass')) return 'yellow_brass';
  if (key.includes('bronze')) return 'bronze';
  if (has(/\blfp\b/)) return 'lfp_pack';
  if (has(/\bnmc\b/)) return 'nmc_pack';
  if (has(/\bnca\b/)) return 'nca_pack';
  if (
    has(/\bli(?:-|\s)+ion\b/) ||
    has(/\blithium(?:-|\s)+ion\b/) ||
    (key.includes('battery pack') && !has(/\blfp\b/) && !has(/\bnmc\b/) && !has(/\bnca\b/))
  ) {
    return 'li_ion_pack';
  }
  if (key.includes('module') || key.includes('battery cell')) return 'battery_module_mixed';
  if (key.includes('lithium')) return 'lithium_black_mass';
  if (key.includes('cobalt')) return 'cobalt_black_mass';
  if (key.includes('nickel')) return 'nickel_black_mass';
  if (key.includes('busbar') || key.includes('hairpin')) return 'ev_copper_busbar';
  // EV/battery fuzzy fallbacks (checked before generic 'copper' to avoid misclassifying)
  if (key.includes('busbar')) return 'ev_copper_busbar';
  if (key.includes('black mass') && key.includes('lfp')) return 'lfp_black_mass';
  if (key.includes('black mass') || key.includes('blackmass')) return 'nmc_black_mass';
  if (key.includes('li-ion') || key.includes('lithium') || key.includes('liion')) return 'li_ion_module';
  if ((key.includes('battery') || key.includes('ev ')) && (key.includes('pack') || key.includes('module') || key.includes('cell'))) return 'li_ion_module';
  if (key.includes('circuit board') || key.includes('motherboard') || key.includes('pcb')) return 'pcb_high_grade';
  if (key.includes('cobalt')) return 'cobalt_sulfate';
  if (key.includes('nickel')) return 'nickel_briquette';
  if (key.includes('copper')) return 'copper_2';
  if (key.includes('alumin')) return 'aluminum_clean';
  if (key.includes('stainless')) return 'stainless';
  if (key.includes('compressor') || key.includes('sealed')) return 'sealed_unit';
  if (key.includes('motor')) return 'electric_motor';
  if (key.includes('steel') || key.includes('iron') || key.includes('tin')) return 'light_iron';
  return null;
}

// Per-state payout multipliers relative to the national 1.0 baseline (2026).
// Drivers: proximity to mills/ports, local supply glut, state regulation overhead,
// and transport costs. AK/HI are high because remote freight inflates yard prices.
// Rust-Belt states (MI, IN, OH, PA, WV) are discounted due to chronic supply surplus.
export const REGIONAL_MULTIPLIERS: Record<string, number> = {
  AK: 1.15, // Remote freight cost drives up yard payouts
  AL: 0.88,
  AR: 0.86,
  AZ: 1.02,
  CA: 1.15, // High demand, major Pacific ports
  CO: 1.02,
  CT: 1.08,
  DC: 1.08,
  DE: 1.05,
  FL: 1.03,
  GA: 1.02,
  HI: 1.18, // Island logistics premium
  IA: 0.90,
  ID: 0.89,
  IL: 1.05,
  IN: 0.87, // Industrial Midwest surplus
  KS: 0.90,
  KY: 0.88,
  LA: 0.95,
  MA: 1.10,
  MD: 1.05,
  ME: 1.02,
  MI: 0.88, // Rust Belt surplus
  MN: 0.92,
  MO: 0.92,
  MS: 0.85,
  MT: 0.87,
  NC: 0.92,
  ND: 0.88,
  NE: 0.88,
  NH: 1.05,
  NJ: 1.10,
  NM: 0.90,
  NV: 1.02,
  NY: 1.10,
  OH: 0.90, // Rust Belt surplus
  OK: 0.90,
  OR: 1.08,
  PA: 0.92, // Rust Belt surplus
  RI: 1.07,
  SC: 0.92,
  SD: 0.88,
  TN: 0.90,
  TX: 1.05, // Major industrial hub, Gulf ports
  UT: 0.92,
  VA: 0.95,
  VT: 1.00,
  WA: 1.12, // Pacific Northwest ports
  WI: 0.90,
  WV: 0.85, // Rural, low scrap demand
  WY: 0.87,
};

const DEFAULT_MULTIPLIER = 1.0;

export function getRegionalMultiplier(state: string | undefined): number {
  if (!state) return DEFAULT_MULTIPLIER;
  return REGIONAL_MULTIPLIERS[state.toUpperCase()] ?? DEFAULT_MULTIPLIER;
}

export function parseWeightRange(weightRange: string): { low: number; high: number } {
  const match = weightRange.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (!match) {
    const single = parseFloat(weightRange);
    const val = isNaN(single) ? 0 : single;
    return { low: val, high: val };
  }
  return { low: parseFloat(match[1]!), high: parseFloat(match[2]!) };
}

export function calculateMetalValue(
  metalType: string,
  weightRange: string,
  multiplier: number,
): { valueLow: number; valueHigh: number } {
  const grade = normalizeMetalType(metalType);
  const price = grade ? METAL_PRICES[grade] : undefined;
  const priceLow = price?.low ?? 0;
  const priceHigh = price?.high ?? 0;
  const { low, high } = parseWeightRange(weightRange);
  return {
    valueLow: parseFloat((low * priceLow * multiplier).toFixed(2)),
    valueHigh: parseFloat((high * priceHigh * multiplier).toFixed(2)),
  };
}

export function calculateTotalValue(
  metals: Array<{ valueLow: number; valueHigh: number }>,
): { totalLow: number; totalHigh: number } {
  return metals.reduce(
    (acc, m) => ({
      totalLow: parseFloat((acc.totalLow + m.valueLow).toFixed(2)),
      totalHigh: parseFloat((acc.totalHigh + m.valueHigh).toFixed(2)),
    }),
    { totalLow: 0, totalHigh: 0 },
  );
}

// ---------------------------------------------------------------------------
// Per-yard valuation (Part A — payout comparison engine)
// ---------------------------------------------------------------------------

/**
 * Computes the payout for a single metal at a specific yard.
 *
 * Formula: basePrice × weight × stateMultiplier × yard.payoutFactor
 *          × yard.gradePremiums[grade]  (if present)
 *
 * @param metalType   Free-text or canonical grade string (resolved via normalizeMetalType).
 * @param weightRange Weight string, e.g. "2-4 lbs".
 * @param stateMultiplier  Regional multiplier for the YARD's state (not the user's).
 * @param yard        The specific scrap yard to price for.
 */
export function calculateMetalValueAtYard(
  metalType: string,
  weightRange: string,
  stateMultiplier: number,
  yard: ScrapYard,
): { valueLow: number; valueHigh: number } {
  const grade = normalizeMetalType(metalType);
  const price = grade ? METAL_PRICES[grade] : undefined;
  const priceLow = price?.low ?? 0;
  const priceHigh = price?.high ?? 0;
  const { low, high } = parseWeightRange(weightRange);
  const gradePremium = (grade != null ? (yard.gradePremiums?.[grade] ?? 1.0) : 1.0);
  const factor = stateMultiplier * yard.payoutFactor * gradePremium;
  return {
    valueLow: parseFloat((low * priceLow * factor).toFixed(2)),
    valueHigh: parseFloat((high * priceHigh * factor).toFixed(2)),
  };
}

/**
 * Computes the total payout for a set of raw metals at a specific yard.
 *
 * @param metals      Array of { type, weightRange } from the AI analysis.
 * @param stateMultiplier  Regional multiplier for the YARD's state.
 * @param yard        The specific scrap yard.
 */
export function calculateTotalValueAtYard(
  metals: Array<{ type: string; weightRange: string }>,
  stateMultiplier: number,
  yard: ScrapYard,
): { totalLow: number; totalHigh: number } {
  const values = metals.map((m) =>
    calculateMetalValueAtYard(m.type, m.weightRange, stateMultiplier, yard),
  );
  return values.reduce(
    (acc, v) => ({
      totalLow: parseFloat((acc.totalLow + v.valueLow).toFixed(2)),
      totalHigh: parseFloat((acc.totalHigh + v.valueHigh).toFixed(2)),
    }),
    { totalLow: 0, totalHigh: 0 },
  );
}
