import OpenAI from 'openai';
import { z } from 'zod';
import { calculateMetalValue } from './pricing';

const client = new OpenAI({
  apiKey: process.env['AZURE_OPENAI_API_KEY'],
  baseURL: `${process.env['AZURE_OPENAI_ENDPOINT']}/openai/deployments/gpt-4o-2024-08-06`,
  defaultQuery: { 'api-version': '2024-08-01-preview' },
  defaultHeaders: { 'api-key': process.env['AZURE_OPENAI_API_KEY'] ?? '' },
});

const GPT4oScrapSchema = {
  type: 'object',
  properties: {
    objectName: { type: 'string' },
    metals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          weightRange: { type: 'string', description: 'e.g. "2-4 lbs"' },
          percentage: { type: 'number' },
        },
        required: ['type', 'weightRange', 'percentage'],
        additionalProperties: false,
      },
    },
    extractionSteps: { type: 'array', items: { type: 'string' } },
    difficulty: { type: 'string', enum: ['easy', 'moderate', 'hard'] },
    safetyWarnings: { type: 'array', items: { type: 'string' } },
    batteryPassport: {
      type: 'object',
      properties: {
        stateOfHealthPct: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        cycleCount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        manufacturer: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        chemistry: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        passportId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        complianceStatus: { type: 'string', enum: ['compliant', 'partial', 'missing'] },
        captureRecommendations: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'stateOfHealthPct',
        'cycleCount',
        'manufacturer',
        'chemistry',
        'passportId',
        'complianceStatus',
        'captureRecommendations',
      ],
      additionalProperties: false,
    },
    // Optional battery object — null when no battery is detected.
    // With strict:true, all fields must be required but nullable.
    battery: {
      anyOf: [
        {
          type: 'object',
          properties: {
            chemistry: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
              description: 'Cell chemistry, e.g. "NMC 811", "LFP", "NCA", "NiMH", "lead-acid".',
            },
            stateOfHealth: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
              description: 'State of health as reported on label/passport, e.g. "92%" or "unknown".',
            },
            cycleCount: {
              anyOf: [{ type: 'number' }, { type: 'null' }],
              description: 'Cycle count from label or BMS readout if visible.',
            },
            batteryPassportPresent: {
              anyOf: [{ type: 'boolean' }, { type: 'null' }],
              description: 'True if a Digital Battery Passport QR code or NFC label is visible.',
            },
          },
          required: ['chemistry', 'stateOfHealth', 'cycleCount', 'batteryPassportPresent'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
  },
  required: ['objectName', 'metals', 'extractionSteps', 'difficulty', 'safetyWarnings', 'batteryPassport', 'battery'],
  additionalProperties: false,
};

const RawAnalysisSchema = z.object({
  objectName: z.string(),
  metals: z.array(
    z.object({
      type: z.string(),
      weightRange: z.string(),
      percentage: z.number(),
    }),
  ),
  extractionSteps: z.array(z.string()),
  difficulty: z.enum(['easy', 'moderate', 'hard']),
  safetyWarnings: z.array(z.string()),
  batteryPassport: z.object({
    stateOfHealthPct: z.number().nullable(),
    cycleCount: z.number().nullable(),
    manufacturer: z.string().nullable(),
    chemistry: z.string().nullable(),
    passportId: z.string().nullable(),
    complianceStatus: z.enum(['compliant', 'partial', 'missing']),
    captureRecommendations: z.array(z.string()),
  }),
  battery: z
    .object({
      chemistry: z.string().nullable(),
      stateOfHealth: z.string().nullable(),
      cycleCount: z.number().nullable(),
      batteryPassportPresent: z.boolean().nullable(),
    })
    .nullable(),
});

function buildEraContext(year: number): string {
  const hints: string[] = [];

  // Electronics / circuit boards
  if (year < 2006) {
    hints.push('Electronics from before 2006 use lead-based solder (60/40 tin-lead) — flag lead as a hazardous material and include it in the metals list.');
  } else {
    hints.push('Electronics from 2006 onward use lead-free solder (tin-silver-copper alloy, SAC305) — no lead solder present.');
  }

  // CRT vs flat-panel era
  if (year < 2005) {
    hints.push('If this is a television or monitor, it is likely a CRT type: expect significant copper (5–10% by weight) in the deflection yoke and degaussing coil, plus a lead-containing glass envelope.');
  } else {
    hints.push('If this is a television or monitor, it is likely a flat-panel type: minimal copper, aluminum frame, small circuit boards.');
  }

  // Catalytic converters (cars)
  if (year < 1975) {
    hints.push('Vehicles before 1975 predate mandatory catalytic converters — no platinum-group metals (platinum, palladium, rhodium) in the exhaust system. Expect heavier steel body panels, more copper/brass in the radiator.');
  } else if (year >= 1975 && year < 2000) {
    hints.push('Vehicles from 1975–1999 have catalytic converters containing platinum and palladium. Radiators are still copper/brass in most models.');
  } else if (year >= 2000) {
    hints.push('Vehicles from 2000+ have catalytic converters with platinum, palladium, and rhodium. Aluminum engine blocks and wheels are common. Aluminum-intensive body panels more likely after 2010.');
  }

  // EV / hybrid battery metals
  if (year >= 2010) {
    hints.push('Hybrid and electric vehicles from 2010+ contain lithium-ion battery packs with lithium, cobalt, and nickel. Electric motors contain neodymium magnets.');
  }

  // Household aluminum wiring window
  if (year >= 1965 && year <= 1973) {
    hints.push('Residential buildings and some appliances from 1965–1973 may contain aluminum branch-circuit wiring instead of copper — a known fire-hazard era; check wiring material carefully.');
  }

  // Appliance metal composition shift
  if (year < 1990) {
    hints.push('Appliances before 1990 use heavier-gauge steel casings and more copper wiring than modern equivalents. Expect higher steel and copper yield per pound of appliance weight.');
  } else if (year >= 1990 && year < 2005) {
    hints.push('Appliances from 1990–2004 began substituting aluminum for some copper components and used thinner steel panels. Plastics content increasing.');
  } else {
    hints.push('Modern appliances (2005+) use thinner steel, more aluminum in coils and motors, and substantially more plastic — lower metal yield per pound compared to older units.');
  }

  // Mercury in older devices
  if (year < 2000) {
    hints.push('Devices before 2000 may contain mercury in switches, relays, thermostats, or fluorescent backlights — flag as hazardous if present.');
  }

  // Cadmium-nickel batteries
  if (year >= 1985 && year < 2005) {
    hints.push('Portable electronics and power tools from 1985–2004 often use nickel-cadmium (NiCd) batteries — cadmium is hazardous; nickel has scrap value.');
  } else if (year >= 2005) {
    hints.push('Portable electronics from 2005+ typically use lithium-ion or NiMH batteries — lithium and cobalt present, cadmium unlikely.');
  }

  return hints.join('\n');
}

export async function analyzeScrapImage(
  imageUrl: string,
  regionalMultiplier: number,
  manufactureYear?: number,
): Promise<z.infer<typeof RawAnalysisSchema> & {
  metals: Array<{ type: string; weightRange: string; percentage: number; valueLow: number; valueHigh: number }>;
}> {
  const eraContext = manufactureYear !== undefined
    ? `\n\nERA CONTEXT (object manufactured in ${manufactureYear}):\n${buildEraContext(manufactureYear)}\nUse this era knowledge to refine your metal type and weight estimates before analyzing the image.`
    : '';

  const response = await client.chat.completions.create(
    {
      model: 'gpt-4o-2024-08-06',
      messages: [
        {
          role: 'system',
          content:
            `You are an expert scrap metal recycler. Analyze objects, identify recyclable metals with WEIGHT RANGES (e.g. "2-4 lbs"), provide step-by-step extraction instructions, safety warnings. Return strict JSON only.${eraContext}`,
          content: [
            'You are an expert scrap metal recycler and e-waste specialist.',
            'Analyze the object in the image and identify ALL recyclable metals and materials, including:',
            '- Standard scrap metals: copper (bare bright, #1, #2, ICW, ACR), brass, bronze, aluminum, stainless, electric motors, sealed units, light iron/steel.',
            '- EV and battery components: lithium-ion battery modules/packs (NMC, LFP, NCA), EV copper busbars, battery management system (BMS) boards, black mass.',
            '- E-waste / circuit boards: PCBs/motherboards (high-grade server/GPU or low-grade consumer), cobalt, nickel.',
            'For EACH metal, provide a WEIGHT RANGE in lbs (e.g. "2-4 lbs") and an estimated percentage of total weight.',
            'Provide step-by-step extraction instructions.',
            'List ALL safety warnings, especially:',
            '  ⚡ HIGH-VOLTAGE WARNING for EV battery packs/modules (200–800 V nominal) — thermal runaway and electrocution risk.',
            '  🔥 THERMAL RUNAWAY WARNING for any lithium-based battery — puncture or short-circuit can cause fire.',
            '  ☢ Beryllium, capacitors, or other hazardous components if visible.',
            'If this appears to be an EV battery/pack/module, populate the "battery" field with:',
            '  - chemistry: cell chemistry visible on label (NMC, LFP, NCA, NiMH, lead-acid) or null.',
            '  - stateOfHealth: SoH percentage from label/passport if visible, or null.',
            '  - cycleCount: cycle count from label or BMS if visible, or null.',
            '  - batteryPassportPresent: true if a Digital Battery Passport QR code or NFC label is visible.',
            'If this is NOT a battery, set "battery" to null.',
            'Return strict JSON only.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Identify recyclable metals and materials in this object and provide extraction details.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'scrap_analysis',
          schema: GPT4oScrapSchema,
          strict: true,
        },
      },
      // Increased from 1024: battery + compliance fields add ~35% response size
      // (chemistry, SoH, cycleCount, batteryPassportPresent + EV extraction steps).
      max_tokens: 1400,
    },
    { timeout: 30000 },
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content returned from Azure OpenAI');
  }

  const raw = RawAnalysisSchema.parse(JSON.parse(content));

  const metals = raw.metals.map((m) => {
    const { valueLow, valueHigh } = calculateMetalValue(m.type, m.weightRange, regionalMultiplier);
    return { ...m, valueLow, valueHigh };
  });

  return { ...raw, metals };
}

// ─── OCR helpers (reuse GPT-4o vision — no separate Azure CV needed) ──────────

/**
 * Reads an odometer image and returns the mileage as a number.
 * Returns null if the mileage cannot be confidently determined.
 */
export async function extractMileageFromImage(imageUrl: string): Promise<number | null> {
  try {
    const response = await client.chat.completions.create(
      {
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'This is a photo of a vehicle odometer or mileage display. Return JSON: {"mileage": <number or null>}. Only the integer mileage, no units. Return null if you cannot read it clearly.',
              },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            ],
          },
        ],
        max_tokens: 50,
      },
      { timeout: 15_000 },
    );

    const content = response.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as { mileage?: unknown };
    const m = parsed.mileage;
    if (typeof m === 'number' && m > 0 && m < 2_000_000) return Math.round(m);
    return null;
  } catch {
    return null;
  }
}

/**
 * Reads a scrapyard settlement slip / payout ticket and extracts the total paid.
 * Returns { pricePaid, metalType, weightLbs } — all nullable.
 */
export async function extractSettlementSlip(imageUrl: string): Promise<{
  pricePaid: number | null;
  metalType: string | null;
  weightLbs: number | null;
}> {
  try {
    const response = await client.chat.completions.create(
      {
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'This is a scrapyard payout ticket or settlement slip. Extract: {"pricePaid": <total dollars as number or null>, "metalType": <e.g. "HMS #1", "steel", "aluminum", "copper" or null>, "weightLbs": <weight in lbs as number or null>}. Convert any lbs+oz or tons to decimal lbs. Return null for any field you cannot read.',
              },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            ],
          },
        ],
        max_tokens: 100,
      },
      { timeout: 15_000 },
    );

    const content = response.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as {
      pricePaid?: unknown;
      metalType?: unknown;
      weightLbs?: unknown;
    };

    return {
      pricePaid:  typeof parsed.pricePaid  === 'number' && parsed.pricePaid  > 0 ? parsed.pricePaid  : null,
      metalType:  typeof parsed.metalType  === 'string' && parsed.metalType.length > 0 ? parsed.metalType  : null,
      weightLbs:  typeof parsed.weightLbs  === 'number' && parsed.weightLbs  > 0 ? parsed.weightLbs  : null,
    };
  } catch {
    return { pricePaid: null, metalType: null, weightLbs: null };
  }
}

// ─── Cat converter visual analysis ───────────────────────────────────────────

export interface CatAnalysisResult {
  /** Matched category ID from CAT_TYPES in vehicleData.ts */
  catType: string;
  isOem: boolean | null;
  /** Vehicle make inferred from image, if visible */
  make: string | null;
  /** Vehicle model inferred from image, if visible */
  model: string | null;
  /** Model year inferred from image, if visible */
  year: number | null;
  /** Serial numbers, part numbers, or paint codes on the converter */
  serialMarkings: string | null;
  /** Value range in USD based on catType */
  valueLow: number;
  valueHigh: number;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

// These match the CAT_TYPES in vehicleData.ts — must stay in sync.
const CAT_REFERENCE = `
torpedo       | Large cylindrical Ford cats (F-150, F-250, Econoline Van) | $110–$1,166
large_foreign | Large import cats — Toyota, Honda, Nissan, VW             | $67–$456
small_foreign | Small compact import cats (Civic, Corolla, etc.)           | $15–$228
exotic_hybrid | High-end imports + hybrids (Prius, BMW, Lexus, Benz)      | $200–$670
large_gm      | Large GM trucks, vans, SUVs (Silverado, Suburban, etc.)   | $76–$286
small_gm      | Smaller GM models (highly variable by year/engine)        | $18–$772
breadloaf     | Rectangular domestic sedan cats (Taurus, Impala, etc.)    | $33–$311
dpf           | Diesel Particulate Filter (diesel engines only)           | $30–$806
aftermarket   | Replacement/non-OEM cat — almost no PGM content           | $5–$50
ev            | Electric vehicle — no catalytic converter                 | $0
unknown       | Cannot determine type with confidence                     | $50–$300
`.trim();

const CAT_VALUE_RANGES: Record<string, { low: number; high: number }> = {
  torpedo:       { low: 110,  high: 1166 },
  large_foreign: { low: 67,   high: 456  },
  small_foreign: { low: 15,   high: 228  },
  exotic_hybrid: { low: 200,  high: 670  },
  large_gm:      { low: 76,   high: 286  },
  small_gm:      { low: 18,   high: 772  },
  breadloaf:     { low: 33,   high: 311  },
  dpf:           { low: 30,   high: 806  },
  aftermarket:   { low: 5,    high: 50   },
  ev:            { low: 0,    high: 0    },
  unknown:       { low: 50,   high: 300  },
};

/**
 * Uses GPT-4o vision to analyze a photo of a catalytic converter (or vehicle)
 * and return the type, OEM status, and estimated scrap value range.
 *
 * Photo can be:
 *   - The converter itself (any angle — bottom of car, removed from exhaust)
 *   - The full vehicle (we'll infer cat type from make/model)
 *   - The converter serial number / part number label
 *
 * All fields are best-effort — confidence indicates how sure the model is.
 */
export async function analyzeCatFromImage(imageUrl: string): Promise<CatAnalysisResult> {
  const response = await client.chat.completions.create(
    {
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are an expert scrap metal buyer specializing in catalytic converter identification and pricing. You can identify converter types by shape, size, vehicle make/model, and part number markings. You know current PGM (platinum, palladium, rhodium) market values and how they affect converter pricing.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this image — it may show a catalytic converter, a vehicle undercarriage, a full car, or converter markings/serial numbers.

Identify the converter using these categories (match to the closest id):
${CAT_REFERENCE}

Key visual indicators:
- Torpedo cats: large cylindrical tube shape, usually on Ford trucks
- Large foreign cats: oval/round ceramic brick, medium size, Honda/Toyota
- Exotic/hybrid cats: often double-brick or unusually heavy, on hybrids/luxury
- DPF: long rectangular canister, diesel exhaust systems only
- Aftermarket: cheap looking, thin metal shell, often shiny/new looking
- OEM signs: rust, age-appropriate wear, factory paint codes, heat shielding

Return JSON matching this exact schema:
{
  "catType": "<id from the list above>",
  "isOem": <true | false | null>,
  "make": "<vehicle make or null>",
  "model": "<vehicle model or null>",
  "year": <year as integer or null>,
  "serialMarkings": "<any visible serial/part numbers or null>",
  "confidence": "<high | medium | low>",
  "notes": "<1-2 sentence explanation of what you identified and why>"
}`,
            },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ],
        },
      ],
      max_tokens: 300,
    },
    { timeout: 20_000 },
  );

  const content = response.choices[0]?.message?.content ?? '';
  const parsed = JSON.parse(content) as Partial<CatAnalysisResult>;

  const catType = (typeof parsed.catType === 'string' && parsed.catType in CAT_VALUE_RANGES)
    ? parsed.catType
    : 'unknown';

  const range = CAT_VALUE_RANGES[catType] ?? { low: 50, high: 300 };

  return {
    catType,
    isOem:          typeof parsed.isOem   === 'boolean' ? parsed.isOem   : null,
    make:           typeof parsed.make    === 'string'  ? parsed.make    : null,
    model:          typeof parsed.model   === 'string'  ? parsed.model   : null,
    year:           typeof parsed.year    === 'number'  ? parsed.year    : null,
    serialMarkings: typeof parsed.serialMarkings === 'string' ? parsed.serialMarkings : null,
    valueLow:       range.low,
    valueHigh:      range.high,
    confidence:     (['high', 'medium', 'low'] as const).includes(parsed.confidence as any)
                      ? (parsed.confidence as 'high' | 'medium' | 'low')
                      : 'low',
    notes:          typeof parsed.notes === 'string' ? parsed.notes : '',
  };
}
