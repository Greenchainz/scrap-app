// NHTSA vPIC API — free, no API key required.
// Used to look up real curb weights by year/make/model or VIN.
// Falls back to class averages in vehicleData.ts when NHTSA returns null.
//
// Docs: https://vpic.nhtsa.dot.gov/api/
// Research confirmed: GetCanadianVehicleSpecifications returns CW (curb weight lbs)
// when queried with Year + Make (+ optional Model).

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

/**
 * Returns curb weight in pounds for a given year/make/model.
 * Uses NHTSA GetCanadianVehicleSpecifications endpoint (free, no key).
 * Returns null if NHTSA has no data for this vehicle.
 */
export async function getNHTSACurbWeight(
  year: number,
  make: string,
  model?: string,
): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      Year:  String(year),
      Make:  make,
      units: 'US',
      format: 'json',
      ...(model ? { Model: model } : {}),
    });

    const res = await fetch(
      `${NHTSA_BASE}/GetCanadianVehicleSpecifications/?${params.toString()}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;

    const data: { Results?: { CW?: string }[] } = await res.json();
    const cw = parseFloat(data?.Results?.[0]?.CW ?? '');
    return isNaN(cw) || cw <= 100 ? null : cw;
  } catch {
    return null;
  }
}

/**
 * Returns curb weight in pounds from a 17-character VIN.
 * Uses NHTSA DecodeVinValues endpoint (free, no key).
 * Returns null if NHTSA has no CurbWeightLB for this VIN.
 */
export async function getNHTSACurbWeightByVin(vin: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${NHTSA_BASE}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;

    const data: { Results?: { CurbWeightLB?: string }[] } = await res.json();
    const cw = parseFloat(data?.Results?.[0]?.CurbWeightLB ?? '');
    return isNaN(cw) || cw <= 100 ? null : cw;
  } catch {
    return null;
  }
}
