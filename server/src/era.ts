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

export function normalizeBrand(brand: string): 'ge' | 'whirlpool' | 'frigidaire' | 'samsung' | 'unknown' {
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
  if (b.includes('samsung')) return 'samsung';
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

export function decodeSerialNumber(brand: string, serial: string): DecodedDate {
  const normalized = normalizeBrand(brand);
  if (!serial || !serial.trim()) {
    return { brand: normalized, year: null, month: null, candidateYears: [], confidence: 'low', note: 'No serial number provided.' };
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
