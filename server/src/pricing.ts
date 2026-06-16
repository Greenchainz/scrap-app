import { z } from 'zod';

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
};

// Resolves any free-text metal label to a canonical grade key, or null if unknown.
export function normalizeMetalType(metalType: string): string | null {
  const key = metalType.trim().toLowerCase();
  if (METAL_PRICES[key]) return key;
  if (METAL_ALIASES[key]) return METAL_ALIASES[key]!;
  if (key.includes('bare bright')) return 'copper_bare_bright';
  if (key.includes('icw') || key.includes('insulated copper')) return 'copper_icw';
  if (key.includes('acr') || key.includes('radiator')) return 'acr';
  if (key.includes('brass')) return 'yellow_brass';
  if (key.includes('bronze')) return 'bronze';
  if (key.includes('copper')) return 'copper_2';
  if (key.includes('alumin')) return 'aluminum_clean';
  if (key.includes('stainless')) return 'stainless';
  if (key.includes('compressor') || key.includes('sealed')) return 'sealed_unit';
  if (key.includes('motor')) return 'electric_motor';
  if (key.includes('steel') || key.includes('iron') || key.includes('tin')) return 'light_iron';
  return null;
}

export const REGIONAL_MULTIPLIERS: Record<string, number> = {
  CA: 1.15,
  TX: 1.05,
  VA: 0.95,
  OH: 0.90,
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
