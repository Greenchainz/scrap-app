import { router, protectedProcedure, staffProcedure, TRPCError, z } from '../trpc';
import { db, schema } from '../db';
import {
  METAL_TYPES,
  METAL_TYPE_IDS,
  PRICE_BOUNDS,
  submitPriceReport,
  getLatestPricesForYard,
  validatePriceBounds,
} from '../priceReports';

const VALID_METAL_TYPES = new Set(METAL_TYPE_IDS);

export const yardsRouter = router({
  // Returns the canonical metal type list — mobile uses this to populate pickers.
  getMetalTypes: protectedProcedure.query(() => METAL_TYPES),

  // ---------------------------------------------------------------------------
  // submitPriceReport — GasBuddy-style: user reports what they were actually paid.
  // ---------------------------------------------------------------------------
  submitPriceReport: protectedProcedure
    .input(z.object({
      yardId:     z.string().min(1).max(100),
      metalType:  z.string().min(1),
      pricePerLb: z.number().positive(),
      notes:      z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!VALID_METAL_TYPES.has(input.metalType)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown metal type: ${input.metalType}` });
      }
      if (!validatePriceBounds(input.metalType, input.pricePerLb)) {
        const bounds = PRICE_BOUNDS[input.metalType as keyof typeof PRICE_BOUNDS];
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: bounds
            ? `Price out of expected range ($${bounds[0]}–$${bounds[1]}/lb). Please double-check your entry.`
            : 'Price out of expected range.',
        });
      }
      return submitPriceReport({
        yardId:     input.yardId,
        metalType:  input.metalType,
        pricePerLb: input.pricePerLb,
        source:     'user',
        userId:     ctx.apiKey ?? undefined,
        notes:      input.notes,
        verified:   false,
      });
    }),

  // ---------------------------------------------------------------------------
  // staffSubmitPrice — you call a yard, enter the quote. Marked verified=true.
  // Uses STAFF_API_KEY (falls back to API_KEY if not set).
  // ---------------------------------------------------------------------------
  staffSubmitPrice: staffProcedure
    .input(z.object({
      yardId:     z.string().min(1).max(100),
      metalType:  z.string().min(1),
      pricePerLb: z.number().positive(),
      notes:      z.string().max(1000).optional(),
    }))
    .mutation(async ({ input }) => {
      if (!VALID_METAL_TYPES.has(input.metalType)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown metal type: ${input.metalType}` });
      }
      return submitPriceReport({
        yardId:     input.yardId,
        metalType:  input.metalType,
        pricePerLb: input.pricePerLb,
        source:     'staff',
        notes:      input.notes,
        verified:   true,
      });
    }),

  // ---------------------------------------------------------------------------
  // staffAddYard — add a real yard to the DB after calling them.
  // ---------------------------------------------------------------------------
  staffAddYard: staffProcedure
    .input(z.object({
      name:      z.string().min(1).max(200),
      city:      z.string().min(1).max(100),
      state:     z.string().length(2),
      address:   z.string().max(300).optional(),
      phone:     z.string().max(30).optional(),
      website:   z.string().url().optional(),
      latitude:  z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }))
    .mutation(async ({ input }) => {
      const [yard] = await db
        .insert(schema.yards)
        .values({
          name:      input.name,
          city:      input.city,
          state:     input.state.toUpperCase(),
          address:   input.address ?? null,
          phone:     input.phone ?? null,
          website:   input.website ?? null,
          latitude:  input.latitude,
          longitude: input.longitude,
          status:    'active',
          source:    'staff',
        })
        .returning();
      return yard!;
    }),

  // ---------------------------------------------------------------------------
  // getYardPrices — latest reported prices for a single yard (with freshness).
  // ---------------------------------------------------------------------------
  getYardPrices: protectedProcedure
    .input(z.object({ yardId: z.string().min(1) }))
    .query(async ({ input }) => {
      const reports = await getLatestPricesForYard(input.yardId);
      return reports.map(r => ({
        metalType:  r.metalType,
        pricePerLb: r.pricePerLb,
        source:     r.source,
        verified:   r.verified,
        reportedAt: r.reportedAt.toISOString(),
        ageHours:   Math.round((Date.now() - r.reportedAt.getTime()) / 3_600_000),
        notes:      r.notes,
      }));
    }),
});
