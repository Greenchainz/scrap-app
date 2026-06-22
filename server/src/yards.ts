// Scrap-yard model + seed data for the per-yard payout comparison engine.
//
// IMPORTANT: All yards below are SEED / DEMO DATA — illustrative listings for
// demonstration purposes only. They are NOT real business listings, addresses,
// or verified prices. Replace with a live yard directory in a future phase.
//
// Payout factor: yard-specific multiplier (0.88–1.10) applied ON TOP of the
// per-state REGIONAL_MULTIPLIERS from pricing.ts. Spread intentionally to make
// the "open your eyes" comparison visibly meaningful.

export type ScrapYard = {
  id: string;
  name: string;
  city: string;
  /** U.S. two-letter state abbreviation. */
  state: string;
  latitude: number;
  longitude: number;
  /**
   * Yard-specific payout multiplier layered on top of the state regional
   * multiplier. 1.0 = average for the area; > 1.0 = generous payer;
   * < 1.0 = below-average payer. Range: ~0.88–1.10 in seed data.
   */
  payoutFactor: number;
  /**
   * Optional grade-specific premium applied after the base × state × payoutFactor
   * calculation. E.g. a copper specialist paying 5 % extra: { copper_bare_bright: 1.05 }
   */
  gradePremiums?: Partial<Record<string, number>>;
};

// ---------------------------------------------------------------------------
// Seed / demo yard listings
// ---------------------------------------------------------------------------

/** SEED / DEMO DATA — not real business listings. */
export const SEED_YARDS: ScrapYard[] = [
  // --- New York City area ---------------------------------------------------
  {
    id: 'nyc-01',
    name: 'Bronx Metro Recycling',
    city: 'New York City',
    state: 'NY',
    latitude: 40.8448,
    longitude: -73.8648,
    payoutFactor: 1.06,
    gradePremiums: { copper_bare_bright: 1.04, copper_1: 1.03 },
  },
  {
    id: 'nyc-02',
    name: 'Brooklyn Scrap & Iron',
    city: 'New York City',
    state: 'NY',
    latitude: 40.6782,
    longitude: -73.9442,
    payoutFactor: 0.97,
  },
  {
    id: 'nyc-03',
    name: 'Queens Industrial Metals',
    city: 'New York City',
    state: 'NY',
    latitude: 40.7282,
    longitude: -73.7949,
    payoutFactor: 1.03,
    gradePremiums: { aluminum_clean: 1.06 },
  },
  {
    id: 'nyc-04',
    name: 'Staten Island Salvage',
    city: 'New York City',
    state: 'NY',
    latitude: 40.5795,
    longitude: -74.1502,
    payoutFactor: 0.92,
  },

  // --- Los Angeles area ----------------------------------------------------
  {
    id: 'lax-01',
    name: 'Harbor Metals LA',
    city: 'Los Angeles',
    state: 'CA',
    latitude: 33.7701,
    longitude: -118.1937,
    payoutFactor: 1.07,
    gradePremiums: { ev_copper_busbar: 1.08, li_ion_module: 1.05 },
  },
  {
    id: 'lax-02',
    name: 'Valley Scrap Depot',
    city: 'Los Angeles',
    state: 'CA',
    latitude: 34.1868,
    longitude: -118.3770,
    payoutFactor: 1.02,
  },
  {
    id: 'lax-03',
    name: 'South Gate Recyclers',
    city: 'Los Angeles',
    state: 'CA',
    latitude: 33.9545,
    longitude: -118.2120,
    payoutFactor: 0.94,
  },
  {
    id: 'lax-04',
    name: 'Burbank Copper & Brass',
    city: 'Los Angeles',
    state: 'CA',
    latitude: 34.1808,
    longitude: -118.3090,
    payoutFactor: 1.05,
    gradePremiums: { copper_bare_bright: 1.06, yellow_brass: 1.04 },
  },

  // --- Chicago area --------------------------------------------------------
  {
    id: 'chi-01',
    name: 'Southside Iron & Metal',
    city: 'Chicago',
    state: 'IL',
    latitude: 41.7508,
    longitude: -87.6280,
    payoutFactor: 1.04,
    gradePremiums: { electric_motor: 1.05 },
  },
  {
    id: 'chi-02',
    name: 'North Shore Scrap',
    city: 'Chicago',
    state: 'IL',
    latitude: 42.0451,
    longitude: -87.6878,
    payoutFactor: 0.96,
  },
  {
    id: 'chi-03',
    name: 'Cicero Recycling Hub',
    city: 'Chicago',
    state: 'IL',
    latitude: 41.8456,
    longitude: -87.7539,
    payoutFactor: 1.00,
    gradePremiums: { nmc_black_mass: 1.06, lfp_black_mass: 1.05 },
  },
  {
    id: 'chi-04',
    name: 'West Loop Metal Buyers',
    city: 'Chicago',
    state: 'IL',
    latitude: 41.8857,
    longitude: -87.6475,
    payoutFactor: 0.91,
  },

  // --- Houston area --------------------------------------------------------
  {
    id: 'hou-01',
    name: 'Bayou City Metals',
    city: 'Houston',
    state: 'TX',
    latitude: 29.7604,
    longitude: -95.3698,
    payoutFactor: 1.05,
    gradePremiums: { stainless: 1.07, aluminum_clean: 1.04 },
  },
  {
    id: 'hou-02',
    name: 'Gulf Coast Scrap',
    city: 'Houston',
    state: 'TX',
    latitude: 29.6850,
    longitude: -95.4328,
    payoutFactor: 1.00,
  },
  {
    id: 'hou-03',
    name: 'Pasadena Scrap & Iron',
    city: 'Houston',
    state: 'TX',
    latitude: 29.6911,
    longitude: -95.2091,
    payoutFactor: 0.93,
  },

  // --- Phoenix area --------------------------------------------------------
  {
    id: 'phx-01',
    name: 'Desert Metals Phoenix',
    city: 'Phoenix',
    state: 'AZ',
    latitude: 33.4484,
    longitude: -112.0740,
    payoutFactor: 1.03,
    gradePremiums: { copper_2: 1.04 },
  },
  {
    id: 'phx-02',
    name: 'Tempe Copper Exchange',
    city: 'Phoenix',
    state: 'AZ',
    latitude: 33.4255,
    longitude: -111.9400,
    payoutFactor: 0.97,
  },
  {
    id: 'phx-03',
    name: 'Mesa Salvage & Recycling',
    city: 'Phoenix',
    state: 'AZ',
    latitude: 33.4152,
    longitude: -111.8315,
    payoutFactor: 0.90,
  },

  // --- Columbus, OH area ---------------------------------------------------
  {
    id: 'col-01',
    name: 'Columbus Metal Exchange',
    city: 'Columbus',
    state: 'OH',
    latitude: 39.9612,
    longitude: -82.9988,
    payoutFactor: 1.02,
    gradePremiums: { electric_motor: 1.04, sealed_unit: 1.03 },
  },
  {
    id: 'col-02',
    name: 'Westside Scrap Columbus',
    city: 'Columbus',
    state: 'OH',
    latitude: 39.9659,
    longitude: -83.0500,
    payoutFactor: 0.95,
  },
  {
    id: 'col-03',
    name: 'Short North Recyclers',
    city: 'Columbus',
    state: 'OH',
    latitude: 40.0050,
    longitude: -83.0012,
    payoutFactor: 0.89,
  },

  // --- Seattle / Pacific Northwest -----------------------------------------
  {
    id: 'sea-01',
    name: 'Puget Sound Metals',
    city: 'Seattle',
    state: 'WA',
    latitude: 47.6062,
    longitude: -122.3321,
    payoutFactor: 1.08,
    gradePremiums: { pcb_high_grade: 1.06, ev_copper_busbar: 1.07 },
  },
  {
    id: 'sea-02',
    name: 'Tacoma Scrap Works',
    city: 'Seattle',
    state: 'WA',
    latitude: 47.2529,
    longitude: -122.4443,
    payoutFactor: 1.02,
  },

  // --- Miami / South Florida -----------------------------------------------
  {
    id: 'mia-01',
    name: 'Palmetto Scrap Exchange',
    city: 'Miami',
    state: 'FL',
    latitude: 25.7617,
    longitude: -80.1918,
    payoutFactor: 1.04,
    gradePremiums: { aluminum_clean: 1.05 },
  },
  {
    id: 'mia-02',
    name: 'Hialeah Metal Buyers',
    city: 'Miami',
    state: 'FL',
    latitude: 25.8576,
    longitude: -80.2781,
    payoutFactor: 0.96,
  },

  // --- Rural / contrast points (low-demand areas) --------------------------
  {
    id: 'rur-01',
    name: 'Appalachian Salvage Co.',
    city: 'Charleston',
    state: 'WV',
    latitude: 38.3498,
    longitude: -81.6326,
    payoutFactor: 0.88,
  },
  {
    id: 'rur-02',
    name: 'Panhandle Scrap Depot',
    city: 'Amarillo',
    state: 'TX',
    latitude: 35.2220,
    longitude: -101.8313,
    payoutFactor: 0.90,
  },
  {
    id: 'rur-03',
    name: 'High Plains Metal Works',
    city: 'Cheyenne',
    state: 'WY',
    latitude: 41.1400,
    longitude: -104.8202,
    payoutFactor: 0.88,
  },
];

// ---------------------------------------------------------------------------
// Haversine distance helper
// ---------------------------------------------------------------------------

const EARTH_RADIUS_MILES = 3958.8;

/** Returns the great-circle distance in miles between two lat/lon coordinates. */
export function distanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Returns yards sorted by distance from (lat, lon), closest first.
 * @param limit Maximum number of yards to return (default 10).
 */
export function findNearbyYards(
  lat: number,
  lon: number,
  limit = 10,
): Array<ScrapYard & { distanceMiles: number }> {
  return SEED_YARDS.map((yard) => ({
    ...yard,
    distanceMiles: parseFloat(distanceMiles(lat, lon, yard.latitude, yard.longitude).toFixed(1)),
  }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, limit);
}

/**
 * Returns all yards whose city matches (case-insensitive, substring).
 * Useful for the "explore another city" / for-fun mode.
 */
export function findYardsByCity(city: string): ScrapYard[] {
  const needle = city.trim().toLowerCase();
  return SEED_YARDS.filter((y) => y.city.toLowerCase().includes(needle));
}

/**
 * Returns all yards in a given U.S. state (two-letter abbreviation, case-insensitive).
 */
export function findYardsByState(state: string): ScrapYard[] {
  const needle = state.trim().toUpperCase();
  return SEED_YARDS.filter((y) => y.state === needle);
}

/**
 * Returns a diverse national sample of yards (one per metro area) for use
 * when no location or state is available.
 */
export function getSampleYards(): ScrapYard[] {
  // One representative yard per metro cluster (highest payoutFactor per cluster).
  const sampleIds = [
    'nyc-01', 'lax-01', 'chi-01', 'hou-01', 'phx-01',
    'col-01', 'sea-01', 'mia-01', 'rur-01',
  ];
  return SEED_YARDS.filter((y) => sampleIds.includes(y.id));
}
