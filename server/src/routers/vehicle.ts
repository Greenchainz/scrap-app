import { router, protectedProcedure, staffProcedure, z } from '../trpc';
import { db, schema } from '../db';
import {
  VEHICLE_CLASSES,
  VEHICLE_CLASS_IDS,
  VEHICLE_CONDITIONS,
  VEHICLE_CONDITION_IDS,
  CAT_TYPES,
  CAT_TYPE_IDS,
  VEHICLE_MAKES,
  inferCatTypeFromMake,
} from '../vehicleData';
import { estimateVehicleValue } from '../vehicleValuation';
import {
  findNearbyYardsWithFallback,
} from '../yards';
import { getNHTSACurbWeight, getNHTSACurbWeightByVin } from '../nhtsa';
import { extractMileageFromImage, extractSettlementSlip, analyzeCatFromImage } from '../openai';
import { toReadableImageUrl } from '../blob';

export const vehicleRouter = router({

  // ---------------------------------------------------------------------------
  // getVehicleMetadata — returns all lookup data needed to build the UI form.
  // Mobile calls this once on app load and caches it.
  // ---------------------------------------------------------------------------
  getVehicleMetadata: protectedProcedure.query(() => ({
    vehicleClasses: VEHICLE_CLASSES,
    conditions:     VEHICLE_CONDITIONS,
    catTypes:       CAT_TYPES,
    makes:          VEHICLE_MAKES,
  })),

  // ---------------------------------------------------------------------------
  // inferCatType — given a make string, returns the most likely cat type.
  // Useful for pre-populating the cat type selector when user enters their make.
  // ---------------------------------------------------------------------------
  inferCatType: protectedProcedure
    .input(z.object({ make: z.string().min(1).max(100) }))
    .query(({ input }) => ({
      catType: inferCatTypeFromMake(input.make),
    })),

  // ---------------------------------------------------------------------------
  // lookupVehicleWeight — NHTSA vPIC API lookup for exact curb weight.
  // Call before estimateVehicle to get a more accurate weight for the vehicle.
  // ---------------------------------------------------------------------------
  lookupVehicleWeight: protectedProcedure
    .input(z.object({
      vin:   z.string().length(17).optional(),
      year:  z.number().int().min(1970).max(new Date().getFullYear() + 1).optional(),
      make:  z.string().max(100).optional(),
      model: z.string().max(100).optional(),
    }))
    .query(async ({ input }) => {
      let curbWeightLbs: number | null = null;
      let source: 'vin' | 'ymm' | 'fallback' = 'fallback';

      if (input.vin) {
        curbWeightLbs = await getNHTSACurbWeightByVin(input.vin);
        if (curbWeightLbs) source = 'vin';
      }

      if (!curbWeightLbs && input.year && input.make) {
        curbWeightLbs = await getNHTSACurbWeight(input.year, input.make, input.model);
        if (curbWeightLbs) source = 'ymm';
      }

      return { curbWeightLbs, source };
    }),

  // ---------------------------------------------------------------------------
  // estimateVehicle — the core valuation endpoint.
  // Returns a full breakdown: metal line items + cat converter + total range.
  // New fields: vin, model, catIsOem, mileage, curbWeightLbs
  // ---------------------------------------------------------------------------
  estimateVehicle: protectedProcedure
    .input(z.object({
      vehicleClass:    z.enum(VEHICLE_CLASS_IDS as [string, ...string[]]),
      condition:       z.enum(VEHICLE_CONDITION_IDS as [string, ...string[]]),
      hasCatConverter: z.boolean(),
      catType:         z.enum(CAT_TYPE_IDS as [string, ...string[]]),
      make:            z.string().max(100).optional(),
      model:           z.string().max(100).optional(),
      year:            z.number().int().min(1970).max(new Date().getFullYear() + 1).optional(),
      vin:             z.string().length(17).optional(),
      // OEM vs aftermarket cat — false = aftermarket ($5–$50), default = true (OEM)
      catIsOem:        z.boolean().optional(),
      // Mileage — adjusts running car premium ceiling (>250k = no premium)
      mileage:         z.number().int().min(0).max(2_000_000).optional(),
      // If caller already fetched NHTSA weight, pass it directly to skip the lookup
      curbWeightLbs:   z.number().positive().optional(),
      latitude:        z.number().optional(),
      longitude:       z.number().optional(),
      state:           z.string().length(2).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Resolve actual curb weight — prefer caller-supplied, then NHTSA, then class avg
      let curbWeightLbs = input.curbWeightLbs;
      if (!curbWeightLbs) {
        if (input.vin) {
          curbWeightLbs = await getNHTSACurbWeightByVin(input.vin) ?? undefined;
        }
        if (!curbWeightLbs && input.year && input.make) {
          curbWeightLbs = await getNHTSACurbWeight(input.year, input.make, input.model) ?? undefined;
        }
      }

      // Resolve nearby yard IDs for live price overlay (best effort)
      let nearbyYardIds: string[] = [];
      if (input.latitude != null && input.longitude != null) {
        try {
          const { yards: nearby } = findNearbyYardsWithFallback(
            input.latitude,
            input.longitude,
            input.state,
            15,
            100,
          );
          nearbyYardIds = nearby.map(y => y.id);
        } catch {
          // Non-fatal — fall back to estimated prices
        }
      }

      const result = await estimateVehicleValue({
        vehicleClass:    input.vehicleClass as any,
        condition:       input.condition as any,
        hasCatConverter: input.hasCatConverter,
        catType:         input.catType as any,
        make:            input.make,
        year:            input.year,
        catIsOem:        input.catIsOem,
        mileage:         input.mileage,
        curbWeightLbs,
        nearbyYardIds,
      });

      // Log valuation for analytics (non-fatal if DB unavailable)
      try {
        await db.insert(schema.vehicleValuationLogs).values({
          vehicleClass:    input.vehicleClass,
          make:            input.make ?? null,
          year:            input.year ?? null,
          condition:       input.condition,
          hasCatConverter: input.hasCatConverter,
          catType:         input.catType,
          estimateLow:     result.estimateLow,
          estimateHigh:    result.estimateHigh,
          latitude:        input.latitude ?? null,
          longitude:       input.longitude ?? null,
          state:           input.state ?? null,
          userId:          ctx.apiKey ?? null,
        });
      } catch {
        // Non-fatal
      }

      return result;
    }),

  // ---------------------------------------------------------------------------
  // analyzeCatFromImage — GPT-4o vision identifies cat type + value from photo.
  // User can photograph: the converter itself, the car underside, the vehicle,
  // or a converter serial number label.
  // ---------------------------------------------------------------------------
  analyzeCatFromImage: protectedProcedure
    .input(z.object({ imageUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      const readableUrl = await toReadableImageUrl(input.imageUrl);
      const result = await analyzeCatFromImage(readableUrl);
      return result;
    }),

  // ---------------------------------------------------------------------------
  // extractMileageFromImage — OCR odometer photo via GPT-4o vision.
  // Client uploads photo to blob, passes blobUrl here.
  // ---------------------------------------------------------------------------
  extractMileageFromImage: protectedProcedure
    .input(z.object({ imageUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      const readableUrl = await toReadableImageUrl(input.imageUrl);
      const mileage = await extractMileageFromImage(readableUrl);
      return { mileage };
    }),

  // ---------------------------------------------------------------------------
  // extractSettlementSlip — OCR yard payout ticket via GPT-4o vision.
  // Client uploads slip photo to blob, passes blobUrl here.
  // Result feeds directly into crowdsourced price reports.
  // ---------------------------------------------------------------------------
  extractSettlementSlip: protectedProcedure
    .input(z.object({ imageUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      const readableUrl = await toReadableImageUrl(input.imageUrl);
      const result = await extractSettlementSlip(readableUrl);
      return result;
    }),

  // ---------------------------------------------------------------------------
  // staffUpdateYardType — staff sets whether a yard buys whole cars + yard type.
  // ---------------------------------------------------------------------------
  staffUpdateYardType: staffProcedure
    .input(z.object({
      yardId:   z.string().min(1),
      yardType: z.enum(['full_service', 'pick_and_pull', 'shredder', 'unknown']),
      buysCars: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const { eq } = await import('drizzle-orm');
      const [updated] = await db
        .update(schema.yards)
        .set({
          yardType: input.yardType,
          buysCars: input.buysCars,
          updatedAt: new Date(),
        })
        .where(eq(schema.yards.id, input.yardId))
        .returning();
      return updated ?? null;
    }),
});
