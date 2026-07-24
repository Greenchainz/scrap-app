// NHTSA vPIC API — free, no API key required.
// Used to look up real curb weights by year/make/model or VIN.
// Falls back to class averages in vehicleData.ts when NHTSA returns null.
//
// Docs: https://vpic.nhtsa.dot.gov/api/
// Research confirmed: GetCanadianVehicleSpecifications returns CW (curb weight lbs)
// when queried with Year + Make (+ optional Model).
//
// Performance: responses are cached in-memory with a 24-hour TTL. Vehicle curb
// weights don't change, so caching eliminates redundant 100–5000ms network calls
// for repeated lookups of the same VIN or year/make/model combination.

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

// ─── In-memory TTL cache ──────────────────────────────────────────────────────
// Keyed by request signature. Stores the resolved curb weight (or null for miss).
// Entries expire after CACHE_TTL_MS to eventually pick up NHTSA data corrections.

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 2000;

interface CacheEntry {
  value: number | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): number | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: number | null): void {
  // Evict oldest entries when cache is full (simple FIFO eviction)
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Exposed for testing — clears the NHTSA response cache. */
export function clearNHTSACache(): void {
  cache.clear();
}

/** Exposed for testing/monitoring — returns current cache size. */
export function getNHTSACacheSize(): number {
  return cache.size;
}

/**
 * Returns curb weight in pounds for a given year/make/model.
 * Uses NHTSA GetCanadianVehicleSpecifications endpoint (free, no key).
 * Returns null if NHTSA has no data for this vehicle.
 * Results are cached for 24 hours to avoid redundant network calls.
 */
export async function getNHTSACurbWeight(
  year: number,
  make: string,
  model?: string,
): Promise<number | null> {
  const cacheKey = `ymm:${year}:${make.toLowerCase()}:${(model ?? '').toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const params = new URLSearchParams({
      Year:  String(year),
      Make:  make,
      units: 'US',
      format: 'json',
      ...(model ? { Model: model } : {}),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);
    let res: Response;
    try {
      res = await fetch(
        `${NHTSA_BASE}/GetCanadianVehicleSpecifications/?${params.toString()}`,
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) {
      cacheSet(cacheKey, null);
      return null;
    }

    const data = await res.json() as { Results?: { CW?: string }[] };
    const cw = parseFloat(data?.Results?.[0]?.CW ?? '');
    const result = isNaN(cw) || cw <= 100 ? null : cw;
    cacheSet(cacheKey, result);
    return result;
  } catch {
    // Don't cache transient network errors — let the next call retry
    return null;
  }
}

/**
 * Returns curb weight in pounds from a 17-character VIN.
 * Uses NHTSA DecodeVinValues endpoint (free, no key).
 * Returns null if NHTSA has no CurbWeightLB for this VIN.
 * Results are cached for 24 hours to avoid redundant network calls.
 */
export async function getNHTSACurbWeightByVin(vin: string): Promise<number | null> {
  const cacheKey = `vin:${vin.toUpperCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);
    let res: Response;
    try {
      res = await fetch(
        `${NHTSA_BASE}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) {
      cacheSet(cacheKey, null);
      return null;
    }

    const data = await res.json() as { Results?: { CurbWeightLB?: string }[] };
    const cw = parseFloat(data?.Results?.[0]?.CurbWeightLB ?? '');
    const result = isNaN(cw) || cw <= 100 ? null : cw;
    cacheSet(cacheKey, result);
    return result;
  } catch {
    // Don't cache transient network errors — let the next call retry
    return null;
  }
}
