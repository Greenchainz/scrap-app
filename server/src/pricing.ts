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

export const METAL_PRICES: Record<string, number> = {
  copper: 3.80,
  aluminum: 0.85,
  steel: 0.12,
  brass: 2.50,
  stainless: 0.65,
};

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
  const pricePerLb = METAL_PRICES[metalType.toLowerCase()] ?? 0;
  const { low, high } = parseWeightRange(weightRange);
  return {
    valueLow: parseFloat((low * pricePerLb * multiplier).toFixed(2)),
    valueHigh: parseFloat((high * pricePerLb * multiplier).toFixed(2)),
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
