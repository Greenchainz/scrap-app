// Vehicle whole-car valuation engine.
// Given a vehicle class + condition + cat type, returns a dollar estimate
// broken down by metal type. Uses DB prices when available, fallback otherwise.

import { getLatestPricesForYards } from './priceReports';
import {
  getVehicleClass,
  getConditionMultiplier,
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
  make?:           string; // optional — used to auto-infer catType if not provided
  year?:           number; // optional — reserved for future depreciation adjustment
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
    low:      number;
    high:     number;
  };
  subtotalMetalsLow:   number;
  subtotalMetalsHigh:  number;
  estimateLow:         number;
  estimateHigh:        number;
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
  const conditionMultiplier = getConditionMultiplier(params.condition);

  // Resolve cat type: explicit > inferred from make > fallback 'unknown'
  const catType: CatTypeId =
    params.catType !== 'unknown'
      ? params.catType
      : params.make
        ? inferCatTypeFromMake(params.make)
        : 'unknown';

  const catRange = getCatValueRange(catType);

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

  // Build metal line items
  const metalBreakdown: MetalLineItem[] = VEHICLE_METAL_COMPOSITION.map(({ metalType, fraction }) => {
    const weightLbs = vehicleClass.weightLbs * fraction;
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

  // Cat converter is either full value or zero (stripped/EV)
  const catLow  = params.hasCatConverter ? catRange.low  : 0;
  const catHigh = params.hasCatConverter ? catRange.high : 0;

  const estimateLow  = parseFloat((metalAfterConditionLow  + catLow).toFixed(2));
  const estimateHigh = parseFloat((metalAfterConditionHigh + catHigh).toFixed(2));

  return {
    vehicleWeightLbs:    vehicleClass.weightLbs,
    conditionMultiplier,
    metalBreakdown,
    catConverter: {
      included: params.hasCatConverter,
      catType,
      low:  catLow,
      high: catHigh,
    },
    subtotalMetalsLow:  parseFloat(subtotalMetalsLow.toFixed(2)),
    subtotalMetalsHigh: parseFloat(subtotalMetalsHigh.toFixed(2)),
    estimateLow,
    estimateHigh,
    usedLiveData,
  };
}
