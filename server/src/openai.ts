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
  required: ['objectName', 'metals', 'extractionSteps', 'difficulty', 'safetyWarnings', 'battery'],
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
  battery: z
    .object({
      chemistry: z.string().nullable(),
      stateOfHealth: z.string().nullable(),
      cycleCount: z.number().nullable(),
      batteryPassportPresent: z.boolean().nullable(),
    })
    .nullable(),
});

export async function analyzeScrapImage(
  imageUrl: string,
  regionalMultiplier: number,
): Promise<z.infer<typeof RawAnalysisSchema> & {
  metals: Array<{ type: string; weightRange: string; percentage: number; valueLow: number; valueHigh: number }>;
}> {
  const response = await client.chat.completions.create(
    {
      model: 'gpt-4o-2024-08-06',
      messages: [
        {
          role: 'system',
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
