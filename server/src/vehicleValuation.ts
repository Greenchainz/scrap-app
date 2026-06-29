// Vehicle whole-car valuation engine.
// Given a vehicle class + condition + cat type, returns a dollar estimate
// broken down by metal type. Uses DB prices when available, fallback otherwise.
//
// Research updates applied (June 28–29, 2026):
//   - Steel fallback updated: $0.085–$0.12/lb ($170–$240/ton actual market)
//   - Condition multipliers reanchored: dead_no_start = 1.0, running = 1.55 avg
//   - OEM vs aftermarket cat distinction added (critical accuracy factor)
//   - Mileage tier input added: affects running car premium ceiling
//   - NHTSA curb weight lookup (curb_weight_lbs override from API)

import { getLatestPricesForYards } from './priceReports';
import {
  getVehicleClass,
  getConditionMultiplier,
  getRunningMileageMultiplier,
  getCatValueRange,
  inferCatTypeFromMake,
  VEHICLE_METAL_COMPOSITION,
  FALLBACK_VEHICLE_PRICES,
  type VehicleClassId,
  type VehicleConditionId,
  type CatTypeId,
} from './vehicleData';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VehicleValuationParams {
  vehicleClass:    VehicleClassId;
  condition:       VehicleConditionId;
  hasCatConverter: boolean;
  catType:         CatTypeId;
  make?:           string; // used to auto-infer catType when not provided
  year?:           number; // reserved for future depreciation / NHTSA lookup
  /**
   * OEM cats have real PGM content ($50–$1,200+).
   * Aftermarket/replacement cats are nearly worthless ($5–$50).
   * Missing this field defaults to OEM.
   */
  catIsOem?:       boolean;
  /**
   * Mileage in miles. Only used when condition = 'runs_drives'.
   * <150k = rebuild candidate (max premium)
   * >250k = no running premium (scrap only)
   */
  mileage?:        number;
  /**
   * Actual curb weight in lbs from NHTSA vPIC API.
   * When provided, overrides the class-average fallback weight.
   */
  curbWeightLbs?:  number;
  /** If provided, prices are overlaid from nearby real yard reports */
  nearbyYardIds?:  string[];
}

export interface MetalLineItem {
  metalType:   string;
  label:       string;
  weightLbs:   number;
  pricePerLbLow:  number;
  pricePerLbHigh: number;
  valueLow:    number;
  valueHigh:   number;
}

export interface VehicleValuationResult {
  vehicleWeightLbs:    number;
  conditionMultiplier: number;
  metalBreakdown:      MetalLineItem[];
  catConverter: {
    included: boolean;
    catType:  CatTypeId;
    isOem:    boolean;
    low:      number;
    high:     number;
  };
  subtotalMetalsLow:   number;
  subtotalMetalsHigh:  number;
  estimateLow:         number;
  estimateHigh:        number;
  /** True when mileage caused the running premium to be capped/reduced */
  mileageLimitedPremium: boolean;
  /** Prices came from real yard reports (true) or fallback estimates (false) */
  usedLiveData:        boolean;
}

const METAL_LABELS: Record<string, string> = {
  steel_hms2:      'Steel (HMS #2)',
  aluminum_cast:   'Aluminum (Cast)',
  copper_wire_ins: 'Copper Wiring',
  stainless_304:   'Stainless Steel',
  zinc:            'Zinc / Die Cast',
};

// ─── Core calculation ─────────────────────────────────────────────────────────

export async function estimateVehicleValue(
  params: VehicleValuationParams,
): Promise<VehicleValuationResult> {
  const vehicleClass = getVehicleClass(params.vehicleClass);

  // Use NHTSA-supplied curb weight when available, else class average
  const vehicleWeightLbs = params.curbWeightLbs ?? vehicleClass.weightLbs;

  // Resolve cat type: explicit > inferred from make > fallback 'unknown'
  const catType: CatTypeId =
    params.catType !== 'unknown'
      ? params.catType
      : params.make
        ? inferCatTypeFromMake(params.make)
        : 'unknown';

  // OEM vs aftermarket: aftermarket forces catType to 'aftermarket' value range
  const isOem = params.catIsOem !== false; // default true
  const effectiveCatType: CatTypeId = isOem ? catType : 'aftermarket';
  const catRange = getCatValueRange(effectiveCatType);

  // Condition multiplier — mileage adjusts running premium
  let conditionMultiplier = getConditionMultiplier(params.condition);
  let mileageLimitedPremium = false;

  if (params.condition === 'runs_drives' && params.mileage !== undefined) {
    const mileageMultiplier = getRunningMileageMultiplier(params.mileage);
    // If mileage reduces the premium below default (1.55), flag it
    if (mileageMultiplier < conditionMultiplier) mileageLimitedPremium = true;
    conditionMultiplier = mileageMultiplier;
  }

  // Fetch latest prices from nearby yards (if yard IDs provided)
  let liveByMetal: Record<string, { low: number; high: number }> = {};
  let usedLiveData = false;

  if (params.nearbyYardIds && params.nearbyYardIds.length > 0) {
    const byYard = await getLatestPricesForYards(params.nearbyYardIds);
    const metalSamples: Record<string, number[]> = {};

    for (const reports of Object.values(byYard)) {
      for (const r of reports) {
        if (!metalSamples[r.metalType]) metalSamples[r.metalType] = [];
        metalSamples[r.metalType]!.push(r.pricePerLb);
      }
    }

    for (const [metalType, prices] of Object.entries(metalSamples)) {
      if (prices.length === 0) continue;
      prices.sort((a, b) => a - b);
      liveByMetal[metalType] = {
        low:  prices[0]!,
        high: prices[prices.length - 1]!,
      };
      usedLiveData = true;
    }
  }

  // Build metal line items using actual curb weight
  const metalBreakdown: MetalLineItem[] = VEHICLE_METAL_COMPOSITION.map(({ metalType, fraction }) => {
    const weightLbs = vehicleWeightLbs * fraction;
    const live = liveByMetal[metalType];
    const fallback = FALLBACK_VEHICLE_PRICES[metalType] ?? { low: 0.05, high: 0.15 };
    const pricePerLbLow  = live?.low  ?? fallback.low;
    const pricePerLbHigh = live?.high ?? fallback.high;

    return {
      metalType,
      label:          METAL_LABELS[metalType] ?? metalType,
      weightLbs:      parseFloat(weightLbs.toFixed(1)),
      pricePerLbLow,
      pricePerLbHigh,
      valueLow:       parseFloat((weightLbs * pricePerLbLow).toFixed(2)),
      valueHigh:      parseFloat((weightLbs * pricePerLbHigh).toFixed(2)),
    };
  });

  const subtotalMetalsLow  = metalBreakdown.reduce((s, m) => s + m.valueLow,  0);
  const subtotalMetalsHigh = metalBreakdown.reduce((s, m) => s + m.valueHigh, 0);

  // Apply condition multiplier to metal value
  const metalAfterConditionLow  = subtotalMetalsLow  * conditionMultiplier;
  const metalAfterConditionHigh = subtotalMetalsHigh * conditionMultiplier;

  // Cat converter value — zero if stripped or EV
  const catLow  = params.hasCatConverter ? catRange.low  : 0;
  const catHigh = params.hasCatConverter ? catRange.high : 0;

  const estimateLow  = parseFloat((metalAfterConditionLow  + catLow).toFixed(2));
  const estimateHigh = parseFloat((metalAfterConditionHigh + catHigh).toFixed(2));

  return {
    vehicleWeightLbs,
    conditionMultiplier,
    metalBreakdown,
    catConverter: {
      included: params.hasCatConverter,
      catType:  effectiveCatType,
      isOem,
      low:  catLow,
      high: catHigh,
    },
    subtotalMetalsLow:  parseFloat(subtotalMetalsLow.toFixed(2)),
    subtotalMetalsHigh: parseFloat(subtotalMetalsHigh.toFixed(2)),
    estimateLow,
    estimateHigh,
    mileageLimitedPremium,
    usedLiveData,
  };
}
