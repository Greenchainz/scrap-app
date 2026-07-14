// Appliance age + manufacturing-era intelligence.
//
// Decodes manufacturer serial numbers into a production year/month, classifies
// the appliance's manufacturing epoch, and predicts the metal-composition
// profile that drives scrap worth. Pure logic — no I/O — so it is easy to test.
//
// Sources: 2026 scrap valuation spec (GE/Hotpoint 12-year cycle, Whirlpool
// family 3rd-from-end code, Frigidaire decade-digit, Samsung 15/11-digit).

export type Epoch = 'heavy_iron' | 'polymer_shift' | 'high_efficiency' | 'smart_ie5';

export type DecodedDate = {
  brand: string;
  year: number | null;
  month: number | null;
  candidateYears: number[];
  confidence: 'high' | 'medium' | 'low';
  identifierType?: 'appliance_serial' | 'battery_serial' | 'vin';
  manufacturer?: string | null;
  chemistry?: 'NMC' | 'LFP' | 'NCA' | 'LMO' | 'unknown' | null;
  batteryEra?: string | null;
  note?: string;
};

export type EraProfile = {
  epoch: Epoch;
  label: string;
  yearsLabel: string;
  structuralMaterial: string;
  motorWinding: 'copper' | 'aluminum' | 'mixed';
  washerWeightLbs: { low: number; high: number };
  insights: string[];
};

// --- GE / Hotpoint -------------------------------------------------------
// First letter = month, second letter = year (repeats on a 12-year cycle).
const GE_MONTH: Record<string, number> = {
  A: 1, D: 2, F: 3, G: 4, H: 5, L: 6, M: 7, R: 8, S: 9, T: 10, V: 11, Z: 12,
};

const GE_YEAR_CYCLE: Record<string, number[]> = {
  M: [1983, 1995, 2007, 2019],
  R: [1984, 1996, 2008, 2020],
  S: [1985, 1997, 2009, 2021],
  T: [1986, 1998, 2010, 2022],
  V: [1987, 1999, 2011, 2023],
  Z: [1988, 2000, 2012, 2024],
  A: [1989, 2001, 2013, 2025],
};

// --- Whirlpool family (Whirlpool, Maytag, KitchenAid, Amana) --------------
// The character 3rd from the end encodes the year.
const WHIRLPOOL_YEAR: Record<string, number> = {
  K: 2001, L: 2002, M: 2003, P: 2004, R: 2005, S: 2006, T: 2007, V: 2008,
  W: 2009, X: 2010, Y: 2011, A: 2012, B: 2013, D: 2014, E: 2015, F: 2016,
  G: 2017, H: 2018, J: 2019,
};

// --- Samsung --------------------------------------------------------------
const SAMSUNG_YEAR: Record<string, number> = {
  Q: 2008, S: 2009, Z: 2010, B: 2011, C: 2012, D: 2013, F: 2014, G: 2015,
  H: 2016, J: 2017, N: 2020,
};

const SAMSUNG_MONTH: Record<string, number> = {
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  A: 10, B: 11, C: 12,
};

export function normalizeBrand(brand: string): 'ge' | 'whirlpool' | 'frigidaire' | 'samsung' | 'ev' | 'unknown' {
  const b = brand.trim().toLowerCase();
  if (b.includes('ge') || b.includes('general electric') || b.includes('hotpoint')) return 'ge';
  if (
    b.includes('whirlpool') ||
    b.includes('maytag') ||
    b.includes('kitchenaid') ||
    b.includes('amana')
  ) {
    return 'whirlpool';
  }
  if (b.includes('frigidaire') || b.includes('electrolux')) return 'frigidaire';
  if (b.includes('samsung sdi')) return 'ev';
  if (b.includes('samsung')) return 'samsung';
  if (
    b.includes('tesla') ||
    b.includes('rivian') ||
    b.includes('lucid') ||
    b.includes('byd') ||
    b.includes('catl') ||
    b.includes('panasonic') ||
    b.includes('lg energy') ||
    b.includes('sk on') ||
    b.includes('ford') ||
    b.includes('gm') ||
    b.includes('chevrolet') ||
    b.includes('hyundai') ||
    b.includes('kia') ||
    b.includes('volkswagen') ||
    b.includes('vw') ||
    b.includes('audi') ||
    b.includes('bmw') ||
    b.includes('mercedes') ||
    b.includes('nissan') ||
    b.includes('polestar') ||
    b.includes('volvo')
  ) {
    return 'ev';
  }
  return 'unknown';
}

// Picks the most plausible year from a set of cyclic candidates: the latest one
// that is not in the future (allowing next year for fresh stock).
function resolveBestYear(candidates: number[]): number | null {
  if (candidates.length === 0) return null;
  const max = new Date().getFullYear() + 1;
  const eligible = candidates.filter((y) => y <= max);
  if (eligible.length === 0) return Math.min(...candidates);
  return Math.max(...eligible);
}

function decodeGE(serial: string): DecodedDate {
  const s = serial.trim().toUpperCase();
  const monthLetter = s[0] ?? '';
  const yearLetter = s[1] ?? '';
  const month = GE_MONTH[monthLetter] ?? null;
  const candidates = GE_YEAR_CYCLE[yearLetter] ?? [];
  const year = resolveBestYear(candidates);
  return {
    brand: 'ge',
    year,
    month: month != null ? month : null,
    candidateYears: candidates,
    confidence: year != null ? 'medium' : 'low',
    note: candidates.length > 1 ? 'GE year code repeats every 12 years; best guess shown.' : undefined,
  };
}

function decodeWhirlpool(serial: string): DecodedDate {
  const s = serial.trim().toUpperCase();
  const yearChar = s.length >= 3 ? s[s.length - 3]! : '';
  const year = WHIRLPOOL_YEAR[yearChar] ?? null;
  return {
    brand: 'whirlpool',
    year,
    month: null,
    candidateYears: year != null ? [year] : [],
    confidence: year != null ? 'high' : 'low',
    note: year == null ? 'Could not resolve Whirlpool year code (3rd char from end).' : undefined,
  };
}

function decodeFrigidaire(serial: string): DecodedDate {
  const s = serial.trim().toUpperCase();
  // One or more leading factory letters, then year-last-digit, then 2-digit week.
  const match = s.match(/^[A-Z]+(\d)(\d{2})/);
  if (!match) {
    return { brand: 'frigidaire', year: null, month: null, candidateYears: [], confidence: 'low' };
  }
  const lastDigit = parseInt(match[1]!, 10);
  const week = parseInt(match[2]!, 10);
  const maxYear = new Date().getFullYear() + 1;
  const candidates: number[] = [];
  for (let y = 1970; y <= maxYear; y++) {
    if (y % 10 === lastDigit) candidates.push(y);
  }
  const year = resolveBestYear(candidates);
  const month = week >= 1 && week <= 53 ? Math.min(12, Math.ceil(week / 4.345)) : null;
  return {
    brand: 'frigidaire',
    year,
    month,
    candidateYears: candidates,
    confidence: year != null ? 'medium' : 'low',
    note: 'Frigidaire encodes only the last digit of the year (decade resolved by appearance).',
  };
}

function decodeSamsung(serial: string): DecodedDate {
  const s = serial.trim().toUpperCase();
  let yearChar = '';
  let monthChar = '';
  if (s.length >= 15) {
    yearChar = s[7] ?? '';
    monthChar = s[8] ?? '';
  } else if (s.length >= 11) {
    yearChar = s[3] ?? '';
    monthChar = s[4] ?? '';
  } else if (s.length >= 9) {
    yearChar = s[7] ?? '';
    monthChar = s[8] ?? '';
  }
  const year = SAMSUNG_YEAR[yearChar] ?? null;
  const month = SAMSUNG_MONTH[monthChar] ?? null;
  return {
    brand: 'samsung',
    year,
    month,
    candidateYears: year != null ? [year] : [],
    confidence: year != null ? 'high' : 'low',
    note: year == null ? 'Could not resolve Samsung year code at expected position.' : undefined,
  };
}

const VIN_YEAR_CYCLE: Record<string, number[]> = {
  A: [1980, 2010, 2040], B: [1981, 2011, 2041], C: [1982, 2012, 2042], D: [1983, 2013, 2043],
  E: [1984, 2014, 2044], F: [1985, 2015, 2045], G: [1986, 2016, 2046], H: [1987, 2017, 2047],
  J: [1988, 2018, 2048], K: [1989, 2019, 2049], L: [1990, 2020, 2050], M: [1991, 2021, 2051],
  N: [1992, 2022, 2052], P: [1993, 2023, 2053], R: [1994, 2024, 2054], S: [1995, 2025, 2055],
  T: [1996, 2026, 2056], V: [1997, 2027, 2057], W: [1998, 2028, 2058], X: [1999, 2029, 2059],
  Y: [2000, 2030, 2060], '1': [2001, 2031], '2': [2002, 2032], '3': [2003, 2033], '4': [2004, 2034],
  '5': [2005, 2035], '6': [2006, 2036], '7': [2007, 2037], '8': [2008, 2038], '9': [2009, 2039],
};

const VIN_WMI_MANUFACTURER: Record<string, string> = {
  '5YJ': 'Tesla',
  '7SA': 'Tesla',
  'LRW': 'Tesla',
  '1G1': 'Chevrolet',
  '1GC': 'GM',
  '1FM': 'Ford',
  '3FA': 'Ford',
  'KNA': 'Kia',
  'KMH': 'Hyundai',
  'WVW': 'Volkswagen',
  'WBA': 'BMW',
  'WAU': 'Audi',
  'JN1': 'Nissan',
  'YV1': 'Volvo',
};

const BATTERY_SERIAL_MANUFACTURERS: Record<string, string> = {
  TESLA: 'Tesla',
  CATL: 'CATL',
  BYD: 'BYD',
  PANASONIC: 'Panasonic',
  LG: 'LG',
  SKON: 'SK On',
  SAMSUNGSDI: 'SAMSUNG SDI',
  EVE: 'EVE',
};

// Allow limited future dating for pre-stamped pack labels and model-year overlap.
const FUTURE_YEAR_BUFFER = 5;

function inferChemistry(identifier: string, manufacturer: string | null): 'NMC' | 'LFP' | 'NCA' | 'LMO' | 'unknown' {
  const text = `${identifier} ${manufacturer ?? ''}`.toUpperCase();
  if (/\bLFP\b/.test(text)) return 'LFP';
  if (/\bNCA\b/.test(text)) return 'NCA';
  if (/\bNMC\b/.test(text)) return 'NMC';
  if (/\bLMO\b/.test(text)) return 'LMO';
  return 'unknown';
}

const BATTERY_ERA_THRESHOLD = {
  earlyEvEndYear: 2014,
  scaleUpEndYear: 2020,
} as const;

// Timeline buckets aligned to typical EV pack commercialization waves and the
// 2027 Digital Battery Passport enforcement window.
function getBatteryEra(year: number | null): string | null {
  if (year == null) return null;
  if (year <= BATTERY_ERA_THRESHOLD.earlyEvEndYear) return 'early_ev';
  if (year <= BATTERY_ERA_THRESHOLD.scaleUpEndYear) return 'scale_up';
  return 'passport_transition';
}

function decodeVin(vin: string): DecodedDate {
  const code = vin[9] ?? '';
  const candidates = VIN_YEAR_CYCLE[code] ?? [];
  const year = resolveBestYear(candidates);
  const manufacturer = VIN_WMI_MANUFACTURER[vin.slice(0, 3)] ?? null;
  const chemistry = inferChemistry(vin, manufacturer);
  return {
    brand: 'ev',
    year,
    month: null,
    candidateYears: candidates,
    confidence: year != null ? 'high' : 'low',
    identifierType: 'vin',
    manufacturer,
    chemistry,
    batteryEra: getBatteryEra(year),
    note: year == null ? 'Could not resolve VIN model year code.' : undefined,
  };
}

function decodeBatterySerial(serial: string): DecodedDate {
  const s = serial.trim().toUpperCase();
  const maxYear = new Date().getFullYear() + FUTURE_YEAR_BUFFER;
  const yearMatches = Array.from(s.matchAll(/(20\d{2})/g), (m) => parseInt(m[1]!, 10)).filter(
    (y) => y >= 2000 && y <= maxYear,
  );
  const year = resolveBestYear(yearMatches);
  const monthMatch = s.match(/(?:20\d{2})[-_/]?([01]\d)/);
  const parsedMonth = monthMatch ? parseInt(monthMatch[1]!, 10) : null;
  const month = parsedMonth != null && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : null;
  const manufacturerToken = Object.keys(BATTERY_SERIAL_MANUFACTURERS).find((token) => s.includes(token)) ?? null;
  const manufacturer = manufacturerToken ? BATTERY_SERIAL_MANUFACTURERS[manufacturerToken] : null;
  const chemistry = inferChemistry(s, manufacturer);
  return {
    brand: 'ev',
    year,
    month,
    candidateYears: yearMatches,
    confidence: year != null || chemistry !== 'unknown' ? 'medium' : 'low',
    identifierType: 'battery_serial',
    manufacturer,
    chemistry,
    batteryEra: getBatteryEra(year),
    note: year == null && chemistry === 'unknown' ? 'Battery serial parsed with limited confidence.' : undefined,
  };
}

export function decodeSerialNumber(brand: string, serial: string): DecodedDate {
  const normalized = normalizeBrand(brand);
  if (!serial || !serial.trim()) {
    return { brand: normalized, year: null, month: null, candidateYears: [], confidence: 'low', note: 'No serial number provided.' };
  }
  const cleaned = serial.trim().toUpperCase();
  if (/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) {
    return decodeVin(cleaned);
  }
  switch (normalized) {
    case 'ge':
      return decodeGE(serial);
    case 'whirlpool':
      return decodeWhirlpool(serial);
    case 'frigidaire':
      return decodeFrigidaire(serial);
    case 'samsung':
      return decodeSamsung(serial);
    case 'ev':
      return decodeBatterySerial(serial);
    default:
      return {
        brand: 'unknown',
        year: null,
        month: null,
        candidateYears: [],
        confidence: 'low',
        note: `Unsupported brand for serial decoding: "${brand}".`,
      };
  }
}

// --- Epoch classification + material profiles ----------------------------

export function getEpochForYear(year: number): Epoch {
  if (year < 1980) return 'heavy_iron';
  if (year <= 2004) return 'polymer_shift';
  if (year <= 2019) return 'high_efficiency';
  return 'smart_ie5';
}

const EPOCH_PROFILES: Record<Epoch, EraProfile> = {
  heavy_iron: {
    epoch: 'heavy_iron',
    label: 'Heavy Iron Era',
    yearsLabel: 'Pre-1980',
    structuralMaterial: 'Thick-gauge galvanized steel with cast-iron bases',
    motorWinding: 'copper',
    washerWeightLbs: { low: 200, high: 250 },
    insights: [
      'Highest ferrous weight of any era.',
      'Motors are reliably wound with heavy, thick-gauge copper.',
      'Vintage cast-iron motor housings add significant weight.',
    ],
  },
  polymer_shift: {
    epoch: 'polymer_shift',
    label: 'Polymer & Cost-Reduction Era',
    yearsLabel: '1980–2004',
    structuralMaterial: 'Thin sheet steel with polypropylene/ABS tubs',
    motorWinding: 'aluminum',
    washerWeightLbs: { low: 130, high: 170 },
    insights: [
      'High plastic-to-metal ratio dilutes gross weight.',
      'Motor windings are likely low-value aluminum — scratch-test to confirm.',
      'Watch for deceptive copper-colored enamel over aluminum windings.',
    ],
  },
  high_efficiency: {
    epoch: 'high_efficiency',
    label: 'High-Efficiency Era',
    yearsLabel: '2005–2019',
    structuralMaterial: 'Thin steel with massive concrete counterweights',
    motorWinding: 'mixed',
    washerWeightLbs: { low: 150, high: 200 },
    insights: [
      'Deduct the 30–55 lb concrete counterweight — it has zero scrap value.',
      'Front-loaders usually have a high-value stainless-steel drum.',
      'Budget units use aluminum windings; HE units use copper.',
    ],
  },
  smart_ie5: {
    epoch: 'smart_ie5',
    label: 'Smart / IE5 Era',
    yearsLabel: '2020–2026+',
    structuralMaterial: 'Thin steel, extensive plastics, digital displays',
    motorWinding: 'copper',
    washerWeightLbs: { low: 160, high: 220 },
    insights: [
      'DC inverter motors yield high copper recovery (15–18% Cu by weight).',
      'Mandated 99.99% copper windings for IE4/IE5 efficiency.',
      'Integrated PCBs carry lucrative e-waste value (post-2015 units).',
    ],
  },
};

export function getEraProfile(year: number): EraProfile {
  return EPOCH_PROFILES[getEpochForYear(year)];
}

// Convenience: decoded date -> era profile (null when the year is unknown).
export function describeEra(decoded: DecodedDate): EraProfile | null {
  if (decoded.year == null) return null;
  return getEraProfile(decoded.year);
}

// ===========================================================================
// Battery-chemistry era classifier (Part B — EV / battery recognition)
//
// ADDITIVE: nothing above this line is modified. The appliance epoch logic
// remains fully intact. This section adds a parallel classification axis for
// EV battery packs, modules, and cells.
// ===========================================================================

/**
 * Battery chemistry eras keyed to approximate production-year ranges.
 *
 * - lead_acid    : pre-2000  (SLI auto, forklift, stationary UPS)
 * - early_liion  : 2000–2012 (first-gen consumer EVs, NiMH hybrids crossing to Li)
 * - nmc_era      : 2013–2020 (NMC dominance: Tesla S/X, BMW i3, Bolt, Leaf gen 2)
 * - lfp_era      : 2021–2026 (LFP surge: Tesla 3/Y std-range, BYD, CATL, Rivian opt)
 * - passport_2027: 2027+     (EU Battery Regulation 2023/1542 Digital Battery Passport
 *                             mandatory for traction batteries ≥ 2 kWh;
 *                             state-of-health, cycle count, carbon footprint required)
 */
export type BatteryChemistryEra =
  | 'lead_acid'
  | 'early_liion'
  | 'nmc_era'
  | 'lfp_era'
  | 'passport_2027';

export type BatteryProfile = {
  era: BatteryChemistryEra;
  label: string;
  yearsLabel: string;
  /** Most common cell chemistry in this era (e.g. "NMC 811", "LFP"). */
  dominantChemistry: string;
  /** Metals typically recoverable from this battery type (canonical grade keys). */
  recoverableMetals: string[];
  /** Notes on value density relative to other battery eras. */
  valueDensityNote: string;
  /** Compliance and regulatory notes relevant to recyclers. */
  complianceNote: string;
};

const BATTERY_PROFILES: Record<BatteryChemistryEra, BatteryProfile> = {
  lead_acid: {
    era: 'lead_acid',
    label: 'Lead-Acid Era',
    yearsLabel: 'Pre-2000',
    dominantChemistry: 'Lead-acid (flooded / AGM / gel)',
    recoverableMetals: ['light_iron', 'stainless'],
    valueDensityNote:
      'Lead plates have modest scrap value; core charge programs often exceed spot price. ' +
      'Avoid cracked cases — acid spill hazard.',
    complianceNote:
      'Lead-acid batteries are regulated hazardous waste. Most states mandate recycler take-back. ' +
      'No Digital Battery Passport requirement.',
  },
  early_liion: {
    era: 'early_liion',
    label: 'Early Li-ion / NiMH Era',
    yearsLabel: '2000–2012',
    dominantChemistry: 'NMC / NCA / NiMH (transitional)',
    recoverableMetals: ['li_ion_module', 'aluminum_clean', 'copper_2', 'nickel_briquette'],
    valueDensityNote:
      'Lower energy density than later packs; cobalt content is present but lower than peak NMC. ' +
      'NiMH packs (Prius Gen 1–2) yield recoverable nickel.',
    complianceNote:
      'No EU Battery Passport requirement (predates 2027 mandate). ' +
      'Safe-discharge and insulation protocols still required before teardown.',
  },
  nmc_era: {
    era: 'nmc_era',
    label: 'NMC Dominance Era',
    yearsLabel: '2013–2020',
    dominantChemistry: 'NMC 111 / NMC 532 / NMC 622',
    recoverableMetals: ['nmc_black_mass', 'ev_copper_busbar', 'aluminum_clean', 'cobalt_sulfate', 'nickel_briquette'],
    valueDensityNote:
      'Highest cobalt content of any era — cobalt_sulfate recovery is the headline value driver. ' +
      'NMC black mass commands premium over LFP. Copper busbars are substantial (2–4 lbs per module).',
    complianceNote:
      'No EU Battery Passport requirement (predates 2027 mandate). ' +
      'High-voltage packs (200–800 V nominal) — full HV isolation before ANY disassembly. ' +
      'Thermal runaway risk if cells are punctured or short-circuited.',
  },
  lfp_era: {
    era: 'lfp_era',
    label: 'LFP Surge Era',
    yearsLabel: '2021–2026',
    dominantChemistry: 'LFP (LiFePO4) / NMC 811',
    recoverableMetals: ['lfp_black_mass', 'ev_copper_busbar', 'aluminum_clean', 'li_ion_module'],
    valueDensityNote:
      'LFP black mass has lower per-lb value than NMC (no Co/Ni), but high volume. ' +
      'Many packs are cell-to-pack (CTP) — no module-level separation without specialist tooling. ' +
      'NMC 811 packs in this era still carry significant Ni value.',
    complianceNote:
      'EU Battery Regulation 2023/1542 enacted; traction battery Digital Passport requirements ' +
      'take effect Feb 2027 for batteries ≥ 2 kWh. Voluntary adoption starting now. ' +
      'Collect state-of-health (SoH) and cycle count data when QR/NFC passport label is present.',
  },
  passport_2027: {
    era: 'passport_2027',
    label: 'Digital Battery Passport Era',
    yearsLabel: '2027+',
    dominantChemistry: 'NMC 9.5 / LNMO / Solid-state (emerging)',
    recoverableMetals: ['nmc_black_mass', 'lfp_black_mass', 'ev_copper_busbar', 'cobalt_sulfate', 'nickel_briquette'],
    valueDensityNote:
      'Passport-era packs carry a machine-readable QR/NFC Digital Battery Passport. ' +
      'SoH, cycle count, and carbon-footprint data should be logged at end-of-life. ' +
      'Second-life reuse eligibility (SoH > 80%) may exceed scrap value — check before shredding.',
    complianceNote:
      'EU Battery Regulation 2023/1542 Art. 77: Digital Battery Passport is MANDATORY for ' +
      'traction batteries ≥ 2 kWh placed on EU market from Feb 18 2027. ' +
      'Required fields: SoH, remaining capacity, cycle count, chemistry, hazardous substances, ' +
      'carbon footprint, and supply-chain due-diligence data. ' +
      'Recyclers must transmit end-of-life data to the passport system.',
  },
};

/**
 * Classifies a battery pack by the year it was manufactured into a
 * `BatteryChemistryEra`. Pure logic — no I/O.
 */
export function classifyBatteryEraFromYear(year: number): BatteryChemistryEra {
  if (year < 2000) return 'lead_acid';
  if (year < 2013) return 'early_liion';
  if (year < 2021) return 'nmc_era';
  if (year < 2027) return 'lfp_era';
  return 'passport_2027';
}

/**
 * Returns the full battery profile for a given manufacture year.
 */
export function getBatteryProfile(year: number): BatteryProfile {
  return BATTERY_PROFILES[classifyBatteryEraFromYear(year)];
}

// ---------------------------------------------------------------------------
// Light VIN / battery-pack ID parser
// ---------------------------------------------------------------------------

export type DecodedBatteryPack = {
  /** Decoded model year (null if not resolvable). */
  year: number | null;
  /** Battery chemistry era (null if year unknown). */
  chemistryEra: BatteryChemistryEra | null;
  /** Battery profile (null if year unknown). */
  profile: BatteryProfile | null;
  confidence: 'high' | 'medium' | 'low';
  note?: string;
};

/**
 * Attempts to extract a model year from a 17-character VIN (position 10 = model year).
 * Also handles common EV battery pack ID formats (e.g. Tesla pack IDs that embed year digits).
 * Returns a `DecodedBatteryPack` — pure logic, no I/O.
 *
 * @param packId      VIN or battery pack identifier string.
 * @param currentYear Override for the "current year" ceiling (defaults to system year).
 *                    Pass a fixed value in tests to make behavior deterministic.
 */
export function decodeBatteryPackId(packId: string, currentYear = new Date().getFullYear()): DecodedBatteryPack {
  const s = packId.trim().toUpperCase();

  // Standard 17-char VIN: position index 9 (10th char) = model year code.
  if (s.length === 17) {
    const vinYearChar = s[9] ?? '';
    const year = VIN_YEAR_CODES[vinYearChar] ?? null;
    if (year != null) {
      return {
        year,
        chemistryEra: classifyBatteryEraFromYear(year),
        profile: getBatteryProfile(year),
        confidence: 'high',
        note: `VIN model-year code '${vinYearChar}' → ${year}.`,
      };
    }
  }

  // Fallback: look for a 4-digit year embedded in the ID (e.g. Tesla pack IDs).
  const yearMatch = s.match(/20(\d{2})/);
  if (yearMatch) {
    const year = parseInt(`20${yearMatch[1]}`, 10);
    if (year >= 2000 && year <= currentYear + 1) {
      return {
        year,
        chemistryEra: classifyBatteryEraFromYear(year),
        profile: getBatteryProfile(year),
        confidence: 'medium',
        note: `Year ${year} inferred from embedded digits in pack ID.`,
      };
    }
  }

  return {
    year: null,
    chemistryEra: null,
    profile: null,
    confidence: 'low',
    note: 'Could not resolve a model year from this pack ID or VIN.',
  };
}

// SAE J1297 VIN model-year codes (position 10, i.e. index 9 in 0-based).
// The sequence uses letters (excl. I, O, Q, U, Z) and digits 1–9, repeating
// on a 30-year cycle. For EV batteries (post-2010), letters A–X map to 2010+.
// This table covers the 2000–2030 range relevant to EV teardown.
const VIN_YEAR_CODES: Record<string, number> = {
  Y: 2000,
  '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
  '6': 2006, '7': 2007, '8': 2008, '9': 2009,
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015,
  G: 2016, H: 2017, J: 2018, K: 2019, L: 2020, M: 2021,
  N: 2022, P: 2023, R: 2024, S: 2025, T: 2026, V: 2027,
  W: 2028, X: 2029,
};
