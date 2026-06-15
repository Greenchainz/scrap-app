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
  },
  required: ['objectName', 'metals', 'extractionSteps', 'difficulty', 'safetyWarnings'],
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
  const eraContext = manufactureYear != null
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
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Identify recyclable metals in this object and provide extraction details.' },
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
      max_tokens: 1024,
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
