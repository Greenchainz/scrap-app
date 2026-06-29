// Vehicle metadata for whole-car valuation.
// Weights, metal composition, makes, and catalytic converter value ranges.
// UPDATE cat converter ranges once user completes pricing research.

// ─── Vehicle classes ──────────────────────────────────────────────────────────

export const VEHICLE_CLASSES = [
  { id: 'subcompact_car',  label: 'Subcompact Car',        weightLbs: 2700 },
  { id: 'compact_car',     label: 'Compact Car',           weightLbs: 3000 },
  { id: 'midsize_sedan',   label: 'Mid-Size Sedan',        weightLbs: 3300 },
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
// Source: USGS Mineral Resources Program / automotive recycling industry averages.
// Only metals with scrap value are listed; plastics/glass/rubber are excluded.

export const VEHICLE_METAL_COMPOSITION = [
  // id must match METAL_TYPES in priceReports.ts
  { metalType: 'steel_hms2',         fraction: 0.63  }, // body, frame, engine block (HMS #2 grade when shredded)
  { metalType: 'aluminum_cast',      fraction: 0.075 }, // engine, wheels, transmission
  { metalType: 'copper_wire_ins',    fraction: 0.018 }, // wiring harness (insulated)
  { metalType: 'stainless_304',      fraction: 0.018 }, // exhaust manifold, trim
  { metalType: 'zinc',               fraction: 0.008 }, // die cast brackets, door handles
] as const;

// ─── Condition multipliers ────────────────────────────────────────────────────

export const VEHICLE_CONDITIONS = [
  { id: 'runs_drives',  label: 'Runs & Drives',         multiplier: 1.00 },
  { id: 'starts_moves', label: 'Starts, Moves (Limps)', multiplier: 0.95 },
  { id: 'dead_no_start',label: 'Dead / No Start',       multiplier: 0.85 },
  { id: 'junk_stripped',label: 'Junk / Parts Stripped', multiplier: 0.65 },
  { id: 'parts_only',   label: 'Parts Only (No Body)',  multiplier: 0.50 },
] as const;

export type VehicleConditionId = typeof VEHICLE_CONDITIONS[number]['id'];
export const VEHICLE_CONDITION_IDS = VEHICLE_CONDITIONS.map(c => c.id) as VehicleConditionId[];

export function getConditionMultiplier(id: VehicleConditionId): number {
  return VEHICLE_CONDITIONS.find(c => c.id === id)?.multiplier ?? 0.85;
}

// ─── Catalytic converter types + estimated scrap value ───────────────────────
// TODO: refine with real data from converterguys.com / autocatalystmarket.com
// These are conservative ranges. Real data will expand accuracy significantly.

export const CAT_TYPES = [
  {
    id:    'import_standard',
    label: 'Import (Honda, Toyota, Mazda, Subaru, Hyundai, Kia)',
    low:   100,
    high:  350,
  },
  {
    id:    'domestic_standard',
    label: 'Domestic (Ford, GM, Dodge/Ram, Jeep, Chrysler)',
    low:   60,
    high:  200,
  },
  {
    id:    'luxury',
    label: 'Luxury (BMW, Mercedes, Lexus, Audi, Acura, Infiniti, Cadillac)',
    low:   200,
    high:  600,
  },
  {
    id:    'diesel',
    label: 'Diesel Engine',
    low:   40,
    high:  150,
  },
  {
    id:    'hybrid',
    label: 'Hybrid (Prius, Volt, Fusion Hybrid, etc.)',
    low:   300,
    high:  900,
  },
  {
    id:    'ev',
    label: 'Electric Vehicle (No Catalytic Converter)',
    low:   0,
    high:  0,
  },
  {
    id:    'unknown',
    label: 'Unknown / Not Sure',
    low:   60,
    high:  300,
  },
] as const;

export type CatTypeId = typeof CAT_TYPES[number]['id'];
export const CAT_TYPE_IDS = CAT_TYPES.map(c => c.id) as CatTypeId[];

export function getCatValueRange(id: CatTypeId): { low: number; high: number } {
  const cat = CAT_TYPES.find(c => c.id === id);
  return cat ? { low: cat.low, high: cat.high } : { low: 60, high: 200 };
}

// ─── Make → default cat type mapping ─────────────────────────────────────────
// Helps pre-select cat type when user enters make. User can override.

const MAKE_TO_CAT: Record<string, CatTypeId> = {
  honda:      'import_standard',
  toyota:     'import_standard',
  mazda:      'import_standard',
  subaru:     'import_standard',
  mitsubishi: 'import_standard',
  hyundai:    'import_standard',
  kia:        'import_standard',
  nissan:     'import_standard',
  volkswagen: 'import_standard',
  ford:       'domestic_standard',
  chevrolet:  'domestic_standard',
  chevy:      'domestic_standard',
  gmc:        'domestic_standard',
  dodge:      'domestic_standard',
  ram:        'domestic_standard',
  chrysler:   'domestic_standard',
  jeep:       'domestic_standard',
  lincoln:    'domestic_standard',
  buick:      'domestic_standard',
  pontiac:    'domestic_standard',
  cadillac:   'luxury',
  bmw:        'luxury',
  mercedes:   'luxury',
  'mercedes-benz': 'luxury',
  audi:       'luxury',
  lexus:      'luxury',
  acura:      'luxury',
  infiniti:   'luxury',
  volvo:      'luxury',
  porsche:    'luxury',
  land_rover: 'luxury',
  jaguar:     'luxury',
  tesla:      'ev',
  rivian:     'ev',
  lucid:      'ev',
  polestar:   'ev',
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

// ─── Fallback metal prices (used when no DB data exists for a region) ─────────
// Conservative mid-market estimates ($/lb). Update quarterly.

export const FALLBACK_VEHICLE_PRICES: Record<string, { low: number; high: number }> = {
  steel_hms2:      { low: 0.055, high: 0.080 },
  aluminum_cast:   { low: 0.28,  high: 0.38  },
  copper_wire_ins: { low: 0.45,  high: 0.70  },
  stainless_304:   { low: 0.30,  high: 0.50  },
  zinc:            { low: 0.25,  high: 0.38  },
};
