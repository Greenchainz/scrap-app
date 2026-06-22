import { router, protectedProcedure, TRPCError, z } from '../trpc';
import { desc } from 'drizzle-orm';
import { analyzeScrapImage } from '../openai';
import { getRegionalMultiplier, calculateTotalValue } from '../pricing';
import { decodeSerialNumber, describeEra } from '../era';
import { createUploadSas, toReadableImageUrl } from '../blob';
import { db, schema } from '../db';

const AnalyzeInputSchema = z.object({
  imageUrl: z.string().url(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  state: z.string().optional(),
  brand: z.string().optional(),
  serialNumber: z.string().optional(),
});

export const scrapRouter = router({
  analyzeImage: protectedProcedure
    .input(AnalyzeInputSchema)
    .mutation(async ({ input }) => {
      const multiplier = getRegionalMultiplier(input.state);

      let analysis: Awaited<ReturnType<typeof analyzeScrapImage>>;
      try {
        // The stored container is private, so mint a short-lived read SAS URL
        // for the (otherwise inaccessible) blob before handing it to OpenAI.
        const readableImageUrl = await toReadableImageUrl(input.imageUrl);
        analysis = await analyzeScrapImage(readableImageUrl, multiplier);
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Image analysis failed',
        });
      }

      const { totalLow, totalHigh } = calculateTotalValue(analysis.metals);

      const decoded =
        input.brand && input.serialNumber
          ? decodeSerialNumber(input.brand, input.serialNumber)
          : null;
      const eraProfile = decoded ? describeEra(decoded) : null;
      const era = decoded ? { decoded, profile: eraProfile } : null;

      let scanId: number | undefined;
      try {
        const inserted = await db
          .insert(schema.scans)
          .values({
            imageUrl: input.imageUrl,
            objectName: analysis.objectName,
            analysis: { ...analysis, era } as unknown as Record<string, unknown>,
            estimatedValueLow: totalLow,
            estimatedValueHigh: totalHigh,
            latitude: input.latitude,
            longitude: input.longitude,
          })
          .returning({ id: schema.scans.id });
        scanId = inserted[0]?.id;
      } catch {
        // Non-fatal: return result even if DB write fails
      }

      return {
        scanId,
        objectName: analysis.objectName,
        metals: analysis.metals,
        extractionSteps: analysis.extractionSteps,
        difficulty: analysis.difficulty,
        safetyWarnings: analysis.safetyWarnings,
        estimatedValueLow: totalLow,
        estimatedValueHigh: totalHigh,
        era,
      };
    }),

  getScans: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(10) }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(schema.scans)
        .orderBy(desc(schema.scans.createdAt))
        .limit(input.limit);
      return rows;
    }),

  decodeSerial: protectedProcedure
    .input(z.object({ brand: z.string().min(1), serialNumber: z.string().min(1) }))
    .query(async ({ input }) => {
      const decoded = decodeSerialNumber(input.brand, input.serialNumber);
      const profile = describeEra(decoded);
      return { decoded, profile };
    }),

  getSasToken: protectedProcedure
    .input(z.object({ filename: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await createUploadSas(input.filename);
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Blob storage not configured',
        });
      }
    }),
});
