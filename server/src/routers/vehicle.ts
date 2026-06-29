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
  getSampleYards,
} from '../yards';

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
  // estimateVehicle — the core valuation endpoint.
  // Returns a full breakdown: metal line items + cat converter + total range.
  // ---------------------------------------------------------------------------
  estimateVehicle: protectedProcedure
    .input(z.object({
      vehicleClass:    z.enum(VEHICLE_CLASS_IDS as [string, ...string[]]),
      condition:       z.enum(VEHICLE_CONDITION_IDS as [string, ...string[]]),
      hasCatConverter: z.boolean(),
      catType:         z.enum(CAT_TYPE_IDS as [string, ...string[]]),
      make:            z.string().max(100).optional(),
      year:            z.number().int().min(1970).max(new Date().getFullYear() + 1).optional(),
      latitude:        z.number().optional(),
      longitude:       z.number().optional(),
      state:           z.string().length(2).optional(),
    }))
    .query(async ({ input, ctx }) => {
      // Resolve nearby yard IDs for live price overlay (best effort — no error if unavailable)
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
