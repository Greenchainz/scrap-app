// Vehicle metadata for whole-car valuation.
// All pricing data updated from research (June 28–29, 2026).
// Cat converter ranges sourced from: RRCats.com, AutoCatalystMarket, iScrap App.
// Steel pricing sourced from: HMS-2 market (late 2025 / early 2026).

// ─── Vehicle classes ──────────────────────────────────────────────────────────
// Weights are curb weights (lbs) — used as fallback when NHTSA returns null.
// Prefer NHTSA GetCanadianVehicleSpecifications for real make/model weights.

export const VEHICLE_CLASSES = [
  { id: 'subcompact_car',  label: 'Subcompact Car',        weightLbs: 2700 },
  { id: 'compact_car',     label: 'Compact Car',           weightLbs: 3000 },
  { id: 'midsize_sedan',   label: 'Mid-Size Sedan',        weightLbs: 3350 },
  { id: 'fullsize_sedan',  label: 'Full-Size Sedan',       weightLbs: 3800 },
  { id: 'compact_suv',     label: 'Compact SUV/Crossover', weightLbs: 3700 },
  { id: 'midsize_suv',     label: 'Mid-Size SUV',          weightLbs: 4600 },
  { id: 'fullsize_suv',    label: 'Full-Size SUV',         weightLbs: 5600 },
  { id: 'compact_pickup',  label: 'Compact Pickup Truck',  weightLbs: 4200 },
  { id: 'fullsize_pickup', label: 'Full-Size Pickup Truck',weightLbs: 5200 },
  { id: 'minivan',         label: 'Minivan',               weightLbs: 4300 },
  { id: 'sports_car',      label: 'Sports Car/Coupe',      weightLbs: 3600 },
  { id: 'large_van',       label: 'Large Van/Cargo Van',   weightLbs: 5100 },
] as const;

export type VehicleClassId = typeof VEHICLE_CLASSES[number]['id'];
export const VEHICLE_CLASS_IDS = VEHICLE_CLASSES.map(c => c.id) as VehicleClassId[];

export function getVehicleClass(id: VehicleClassId) {
  return VEHICLE_CLASSES.find(c => c.id === id)!;
}

// ─── Metal composition (% of curb weight) ────────────────────────────────────
// Source: USGS Mineral Resources Program + automotive recycling industry averages.
// Only metals with scrap value are listed (plastics/glass/rubber excluded).

export const VEHICLE_METAL_COMPOSITION = [
  { metalType: 'steel_hms2',         fraction: 0.63  }, // body, frame, engine block
  { metalType: 'aluminum_cast',      fraction: 0.075 }, // engine, wheels, transmission
  { metalType: 'copper_wire_ins',    fraction: 0.018 }, // wiring harness (insulated)
  { metalType: 'stainless_304',      fraction: 0.018 }, // exhaust manifold, trim
  { metalType: 'zinc',               fraction: 0.008 }, // die cast brackets, handles
] as const;

// ─── Condition multipliers ────────────────────────────────────────────────────
// Research confirmed: running cars command 30–80% premium over dead/non-running.
// Dead/no-start = 1.0 baseline. Running adds premium; stripped/junk subtracts.
// Optional mileage input further adjusts the running car multiplier.

export const VEHICLE_CONDITIONS = [
  { id: 'runs_drives',  label: 'Runs & Drives',         multiplier: 1.55 }, // avg of 30–80% premium
  { id: 'starts_moves', label: 'Starts, Moves (Limps)', multiplier: 1.15 },
  { id: 'dead_no_start',label: 'Dead / No Start',       multiplier: 1.00 }, // baseline
  { id: 'junk_stripped',label: 'Junk / Parts Stripped', multiplier: 0.65 },
  { id: 'parts_only',   label: 'Parts Only (No Body)',  multiplier: 0.50 },
] as const;

export type VehicleConditionId = typeof VEHICLE_CONDITIONS[number]['id'];
export const VEHICLE_CONDITION_IDS = VEHICLE_CONDITIONS.map(c => c.id) as VehicleConditionId[];

export function getConditionMultiplier(id: VehicleConditionId): number {
  return VEHICLE_CONDITIONS.find(c => c.id === id)?.multiplier ?? 1.0;
}

/**
 * Adjusts the runs_drives multiplier based on mileage.
 * Research: <150k = rebuild candidate (max premium); >250k = no running premium.
 */
export function getRunningMileageMultiplier(mileage: number): number {
  if (mileage < 100_000)  return 1.80;
  if (mileage < 150_000)  return 1.65;
  if (mileage < 200_000)  return 1.45;
  if (mileage < 250_000)  return 1.25;
  return 1.00; // >250k — running status is irrelevant, pure scrap value
}

// ─── Catalytic converter types + scrap value ranges ──────────────────────────
// Sources: RRCats.com (June 28, 2026), AutoCatalystMarket, research doc.
// OEM cats only — aftermarket cats are nearly worthless ($5–$50).
// NOTE: prices are highly volatile — they scale with Pt/Pd/Rh spot prices.
//   Pt: ~$51.92/g | Pd: ~$38.19/g | Rh: ~$231.51/g (as of research date)

export const CAT_TYPES = [
  {
    id:    'large_foreign',
    label: 'Large Import Cat (Toyota, Honda, VW)',
    low:   67,
    high:  456,
    note:  'Large displacement foreign imports',
  },
  {
    id:    'small_foreign',
    label: 'Small Import Cat (Compact foreign sedan)',
    low:   15,
    high:  228,
    note:  'Smaller ceramic units from compact import sedans',
  },
  {
    id:    'exotic_hybrid',
    label: 'Exotic / Hybrid Cat (high-end imports, Prius, Volt)',
    low:   200,
    high:  670,
    note:  'Hybrids run cold — heavy PGM loading for rapid catalysis',
  },
  {
    id:    'torpedo',
    label: 'Torpedo Cat (Large Ford F-Series, Eco-Van)',
    low:   110,
    high:  1166,
    note:  'Large cylindrical Ford cats — highest variance',
  },
  {
    id:    'large_gm',
    label: 'Large GM Cat (GM trucks, vans, full-size SUVs)',
    low:   76,
    high:  286,
    note:  'Heavy units from large GM vehicles',
  },
  {
    id:    'small_gm',
    label: 'Small GM Cat (smaller GM models)',
    low:   18,
    high:  772,
    note:  'Highly variable — depends on exact year and engine',
  },
  {
    id:    'breadloaf',
    label: 'Breadloaf Cat (standard domestic sedans)',
    low:   33,
    high:  311,
    note:  'Rectangular loaf-shaped unit common in domestic sedans',
  },
  {
    id:    'dpf',
    label: 'Diesel Particulate Filter (DPF)',
    low:   30,
    high:  806,
    note:  'Diesel engines only — captures soot/particulate matter',
  },
  {
    id:    'aftermarket',
    label: 'Aftermarket Replacement Cat',
    low:   5,
    high:  50,
    note:  'Minimum PGM content — nearly worthless for recycling',
  },
  {
    id:    'ev',
    label: 'Electric Vehicle (No Catalytic Converter)',
    low:   0,
    high:  0,
    note:  'EVs have no catalytic converter',
  },
  {
    id:    'unknown',
    label: 'Unknown / Not Sure',
    low:   50,
    high:  300,
    note:  'Conservative estimate — user can refine',
  },
] as const;

export type CatTypeId = typeof CAT_TYPES[number]['id'];
export const CAT_TYPE_IDS = CAT_TYPES.map(c => c.id) as CatTypeId[];

export function getCatValueRange(id: CatTypeId): { low: number; high: number } {
  const cat = CAT_TYPES.find(c => c.id === id);
  return cat ? { low: cat.low, high: cat.high } : { low: 50, high: 200 };
}

// ─── Make → default cat type mapping ─────────────────────────────────────────
// Based on research: German highest PGM (120% avg), Japanese 75–110%, domestic 60–90%.
// Hybrids always get exotic_hybrid regardless of make.

const MAKE_TO_CAT: Record<string, CatTypeId> = {
  honda:           'large_foreign',
  toyota:          'large_foreign',
  mazda:           'large_foreign',
  subaru:          'large_foreign',
  mitsubishi:      'small_foreign',
  hyundai:         'small_foreign',
  kia:             'small_foreign',
  nissan:          'large_foreign',
  volkswagen:      'large_foreign',
  ford:            'torpedo',       // F-Series is the most common scrapped Ford
  chevrolet:       'large_gm',
  chevy:           'large_gm',
  gmc:             'large_gm',
  dodge:           'breadloaf',
  ram:             'large_gm',      // Ram trucks = large
  chrysler:        'breadloaf',
  jeep:            'large_gm',
  lincoln:         'breadloaf',
  buick:           'breadloaf',
  pontiac:         'breadloaf',
  cadillac:        'exotic_hybrid', // luxury = high PGM
  bmw:             'exotic_hybrid',
  mercedes:        'exotic_hybrid',
  'mercedes-benz': 'exotic_hybrid',
  audi:            'exotic_hybrid',
  lexus:           'exotic_hybrid',
  acura:           'large_foreign',
  infiniti:        'large_foreign',
  volvo:           'exotic_hybrid',
  porsche:         'exotic_hybrid',
  land_rover:      'exotic_hybrid',
  jaguar:          'exotic_hybrid',
  tesla:           'ev',
  rivian:          'ev',
  lucid:           'ev',
  polestar:        'ev',
};

export function inferCatTypeFromMake(make: string): CatTypeId {
  return MAKE_TO_CAT[make.toLowerCase().trim()] ?? 'unknown';
}

// ─── Popular vehicle makes (for UI dropdowns) ─────────────────────────────────

export const VEHICLE_MAKES = [
  'Acura', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler',
  'Dodge', 'Ford', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jaguar', 'Jeep',
  'Kia', 'Land Rover', 'Lexus', 'Lincoln', 'Lucid', 'Mazda', 'Mercedes-Benz',
  'Mitsubishi', 'Nissan', 'Pontiac', 'Porsche', 'Ram', 'Rivian', 'Saturn',
  'Subaru', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo', 'Other',
] as const;

// ─── Fallback metal prices ($/lb) ────────────────────────────────────────────
// Updated from research: HMS-2 whole-car bulk = $170–$240/ton = $0.085–$0.12/lb.
// Used when no DB crowd-sourced prices exist for a region.

export const FALLBACK_VEHICLE_PRICES: Record<string, { low: number; high: number }> = {
  steel_hms2:      { low: 0.085, high: 0.120 }, // $170–$240/ton (research confirmed)
  aluminum_cast:   { low: 0.28,  high: 0.38  },
  copper_wire_ins: { low: 0.45,  high: 0.70  },
  stainless_304:   { low: 0.30,  high: 0.50  },
  zinc:            { low: 0.25,  high: 0.38  },
};

