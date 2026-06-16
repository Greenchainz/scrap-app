import { router, publicProcedure, TRPCError, z } from '../trpc';
import { analyzeScrapImage } from '../openai';
import { getRegionalMultiplier, calculateTotalValue } from '../pricing';
import { decodeSerialNumber, describeEra } from '../era';
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
  analyzeImage: publicProcedure
    .input(AnalyzeInputSchema)
    .mutation(async ({ input }) => {
      const multiplier = getRegionalMultiplier(input.state);

      let analysis: Awaited<ReturnType<typeof analyzeScrapImage>>;
      try {
        analysis = await analyzeScrapImage(input.imageUrl, multiplier);
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

  getScans: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(10) }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(schema.scans)
        .orderBy(schema.scans.createdAt)
        .limit(input.limit);
      return rows;
    }),

  decodeSerial: publicProcedure
    .input(z.object({ brand: z.string().min(1), serialNumber: z.string().min(1) }))
    .query(async ({ input }) => {
      const decoded = decodeSerialNumber(input.brand, input.serialNumber);
      const profile = describeEra(decoded);
      return { decoded, profile };
    }),

  getSasToken: publicProcedure
    .input(z.object({ filename: z.string() }))
    .mutation(async ({ input }) => {
      const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } =
        await import('@azure/storage-blob');

      const connStr = process.env['BLOB_STORAGE_CONNECTION_STRING'];
      if (!connStr) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Blob storage not configured' });
      }

      const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
      const containerName = process.env['BLOB_CONTAINER_NAME'] ?? 'scrap-images';
      const containerClient = blobServiceClient.getContainerClient(containerName);
      await containerClient.createIfNotExists({ access: 'blob' });

      const blobName = `${Date.now()}-${input.filename}`;
      const blobClient = containerClient.getBlobClient(blobName);

      const accountName = blobServiceClient.accountName;
      const accountKey = connStr.match(/AccountKey=([^;]+)/)?.[1] ?? '';
      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

      const expiresOn = new Date(Date.now() + 15 * 60 * 1000);
      const sasToken = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions: BlobSASPermissions.parse('rw'),
          expiresOn,
        },
        sharedKeyCredential,
      ).toString();

      return {
        uploadUrl: `${blobClient.url}?${sasToken}`,
        blobUrl: blobClient.url,
      };
    }),
});
