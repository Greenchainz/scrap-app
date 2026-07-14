import { router, protectedProcedure, TRPCError, z } from '../trpc';
import { desc } from 'drizzle-orm';
import { analyzeScrapImage } from '../openai';
import { getRegionalMultiplier, calculateTotalValue, calculateTotalValueAtYard } from '../pricing';
import { decodeSerialNumber, describeEra } from '../era';
import { createUploadSas, toReadableImageUrl } from '../blob';
import { db, schema } from '../db';
import {
  findNearbyYardsWithFallback,
  findYardsByCity,
  findYardsByState,
  getSampleYards,
  distanceMiles,
  type NearbyFallbackMode,
} from '../yards';
import { getLatestPricesForYards } from '../priceReports';

const AnalyzeInputSchema = z.object({
  imageUrl: z.string().url(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  state: z.string().optional(),
  manufactureYear: z.number().int().min(1900).max(2026).optional(),
  brand: z.string().optional(),
  serialNumber: z.string().optional(),
});

export const scrapRouter = router({
  analyzeImage: protectedProcedure
    .input(AnalyzeInputSchema)
    .mutation(async ({ input }) => {
      const liveBatteryPricingRoadmap = [
        'Ingest daily lithium/cobalt/nickel benchmark feeds and refresh grade baselines.',
        'Blend benchmark feeds with regional yard multipliers for live EV payout ranges.',
        'Publish timestamped price snapshots to battery-grade SKUs for auditability.',
        'Add confidence scoring and staleness alerts when commodity feeds are delayed.',
      ];
      const multiplier = getRegionalMultiplier(input.state);

      let analysis: Awaited<ReturnType<typeof analyzeScrapImage>>;
      try {
        analysis = await analyzeScrapImage(input.imageUrl, multiplier, input.manufactureYear);
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
      const resolvedManufacturer = analysis.batteryPassport.manufacturer ?? decoded?.manufacturer ?? null;
      const resolvedChemistry = analysis.batteryPassport.chemistry ?? decoded?.chemistry ?? null;
      const batteryPassport = {
        ...analysis.batteryPassport,
        manufacturer: resolvedManufacturer,
        chemistry: resolvedChemistry,
      };
      const batteryPassportHooks = {
        ready: batteryPassport.complianceStatus !== 'missing',
        capturePath: '/battery-passport/capture',
        uploadPath: '/battery-passport/upload',
        fields: {
          stateOfHealthPct: batteryPassport.stateOfHealthPct,
          cycleCount: batteryPassport.cycleCount,
          manufacturer: batteryPassport.manufacturer,
          chemistry: batteryPassport.chemistry,
          passportId: batteryPassport.passportId,
          vinOrSerial: input.serialNumber ?? null,
        },
      };

      let scanId: number | undefined;
      try {
        const inserted = await db
          .insert(schema.scans)
          .values({
            imageUrl: input.imageUrl,
            objectName: analysis.objectName,
            analysis: {
              ...analysis,
              batteryPassport,
              era,
              batteryPassportHooks,
              liveBatteryPricingRoadmap,
            } as unknown as Record<string, unknown>,
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
        batteryPassport,
        batteryPassportHooks,
        liveBatteryPricingRoadmap,
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

  // ---------------------------------------------------------------------------
  // Per-yard payout comparison engine (Part A)
  //
  // compareYards: returns a ranked list of scrap yards with per-yard payout
  // estimates for the given metals. Best-paying yard is first.
  //
  // Prefer calling this SEPARATELY from analyzeImage so analysis stays fast.
  // Usage: after analyzeImage resolves, call compareYards with the metals array
  // and the user's location/state.
  //
  // SEED / DEMO DATA: yard directory is hardcoded (yards.ts). Replace with a
  // live yard directory in a future phase.
  // ---------------------------------------------------------------------------
  compareYards: protectedProcedure
    .input(
      z.object({
        metals: z.array(
          z.object({
            type: z.string(),
            weightRange: z.string(),
            percentage: z.number(),
          }),
        ),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        state: z.string().optional(),
        /** Search radius in miles (default 75). Ignored when only state/national fallback applies. */
        maxRadiusMiles: z.number().min(10).max(500).default(75),
        /** Maximum number of yards to return (default 8). */
        limit: z.number().min(1).max(30).default(8),
      }),
    )
    .query(async ({ input }) => {
      const { metals, latitude, longitude, state, limit, maxRadiusMiles } = input;

      // Resolve yard list with radius cap + automatic fallback.
      let candidateYards: ReturnType<typeof getSampleYards>;
      let fallbackMode: NearbyFallbackMode;
      let searchRadiusMiles: number | null = null;

      if (latitude != null && longitude != null) {
        const result = findNearbyYardsWithFallback(
          latitude,
          longitude,
          state,
          Math.max(limit, 20),
          maxRadiusMiles,
        );
        candidateYards = result.yards;
        fallbackMode = result.fallbackMode;
        searchRadiusMiles = result.searchRadiusMiles;
      } else if (state) {
        candidateYards = findYardsByState(state);
        if (candidateYards.length === 0) candidateYards = getSampleYards();
        fallbackMode = candidateYards.length > 0 ? 'state' : 'national';
      } else {
        candidateYards = getSampleYards();
        fallbackMode = 'national';
      }

      // Compute per-yard payout and attach distance when coords are known.
      const results = candidateYards.map((yard) => {
        const yardStateMultiplier = getRegionalMultiplier(yard.state);
        const { totalLow, totalHigh } = calculateTotalValueAtYard(metals, yardStateMultiplier, yard);
        const dist =
          latitude != null && longitude != null
            ? parseFloat(distanceMiles(latitude, longitude, yard.latitude, yard.longitude).toFixed(1))
            : null;
        return {
          yard: {
            id: yard.id,
            name: yard.name,
            city: yard.city,
            state: yard.state,
            address: yard.address ?? null,
            phone: yard.phone ?? null,
            website: yard.website ?? null,
          },
          latitude: yard.latitude,
          longitude: yard.longitude,
          distanceMiles: dist,
          totalLow,
          totalHigh,
        };
      });

      // Sort by totalHigh descending — best payout first.
      results.sort((a, b) => b.totalHigh - a.totalHigh);

      // Overlay real crowd-sourced / staff-called prices from the DB.
      const sliced = results.slice(0, limit);
      const realPrices = await getLatestPricesForYards(sliced.map(r => r.yard.id));

      return {
        yards: sliced.map(r => ({
          ...r,
          // reportedPrices: actual prices people were paid — shown alongside estimates.
          reportedPrices: (realPrices[r.yard.id] ?? []).map(p => ({
            metalType:  p.metalType,
            pricePerLb: p.pricePerLb,
            source:     p.source,     // 'user' | 'staff' | 'scraped'
            verified:   p.verified,
            reportedAt: p.reportedAt.toISOString(),
            ageHours:   Math.round((Date.now() - p.reportedAt.getTime()) / 3_600_000),
          })),
        })),
        fallbackMode,
        searchRadiusMiles,
      };
    }),

  // ---------------------------------------------------------------------------
  // estimateInCity: "for fun / explore" mode — shows what you'd make in any
  // chosen city (e.g. "New York City") regardless of your actual location.
  // ---------------------------------------------------------------------------
  estimateInCity: protectedProcedure
    .input(
      z.object({
        metals: z.array(
          z.object({
            type: z.string(),
            weightRange: z.string(),
            percentage: z.number(),
          }),
        ),
        city: z.string().min(1),
      }),
    )
    .query(({ input }) => {
      const { metals, city } = input;

      const cityYards = findYardsByCity(city);
      if (cityYards.length === 0) {
        return { yards: [], cityBestPayout: { totalLow: 0, totalHigh: 0 }, city };
      }

      const results = cityYards.map((yard) => {
        const yardStateMultiplier = getRegionalMultiplier(yard.state);
        const { totalLow, totalHigh } = calculateTotalValueAtYard(metals, yardStateMultiplier, yard);
        return {
          yard: {
            id: yard.id,
            name: yard.name,
            city: yard.city,
            state: yard.state,
          },
          distanceMiles: null as null,
          totalLow,
          totalHigh,
        };
      });

      // Best payout first.
      results.sort((a, b) => b.totalHigh - a.totalHigh);

      const cityBestPayout = results[0]
        ? { totalLow: results[0].totalLow, totalHigh: results[0].totalHigh }
        : { totalLow: 0, totalHigh: 0 };

      return { yards: results, cityBestPayout, city };
    }),
});
