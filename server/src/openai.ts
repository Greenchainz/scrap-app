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
          content:
            'You are an expert scrap metal recycler. Analyze objects, identify recyclable metals with WEIGHT RANGES (e.g. "2-4 lbs"), provide step-by-step extraction instructions, safety warnings. Return strict JSON only.',
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
