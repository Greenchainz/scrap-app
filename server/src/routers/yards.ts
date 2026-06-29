import { router, protectedProcedure, staffProcedure, TRPCError, z } from '../trpc';
import { db, schema } from '../db';
import { eq, desc, avg, count } from 'drizzle-orm';
import {
  METAL_TYPES,
  METAL_TYPE_IDS,
  PRICE_BOUNDS,
  submitPriceReport,
  getLatestPricesForYard,
  validatePriceBounds,
} from '../priceReports';

  // ---------------------------------------------------------------------------
  // submitYardReview — Yelp-style: user rates their experience at a yard.
  // ---------------------------------------------------------------------------
  submitYardReview: protectedProcedure
    .input(z.object({
      yardId:       z.string().min(1).max(100),
      rating:       z.number().int().min(1).max(5),
      verdict:      z.enum(['great', 'fair', 'fair_but_slow', 'lowballed', 'avoid']),
      saleType:     z.enum(['metal', 'whole_car', 'catalytic_converter', 'parts']).default('metal'),
      offeredPrice: z.number().positive().optional(),
      actualPrice:  z.number().positive().optional(),
      comment:      z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [review] = await db
        .insert(schema.yardReviews)
        .values({
          yardId:       input.yardId,
          userId:       ctx.apiKey ?? null,
          rating:       input.rating,
          verdict:      input.verdict,
          saleType:     input.saleType,
          offeredPrice: input.offeredPrice ?? null,
          actualPrice:  input.actualPrice ?? null,
          comment:      input.comment ?? null,
        })
        .returning();
      return review!;
    }),

  // ---------------------------------------------------------------------------
  // getYardProfile — full profile: yard info + latest prices + recent reviews
  //                  + aggregate rating. The "yard page" data source.
  // ---------------------------------------------------------------------------
  getYardProfile: protectedProcedure
    .input(z.object({ yardId: z.string().min(1) }))
    .query(async ({ input }) => {
      // Prices
      const prices = await getLatestPricesForYard(input.yardId);

      // Reviews (latest 20)
      const reviews = await db
        .select()
        .from(schema.yardReviews)
        .where(eq(schema.yardReviews.yardId, input.yardId))
        .orderBy(desc(schema.yardReviews.createdAt))
        .limit(20);

      // Aggregate stats
      const [stats] = await db
        .select({
          avgRating:   avg(schema.yardReviews.rating),
          reviewCount: count(schema.yardReviews.id),
        })
        .from(schema.yardReviews)
        .where(eq(schema.yardReviews.yardId, input.yardId));

      // Verdict breakdown
      const verdictRows = await db
        .select({ verdict: schema.yardReviews.verdict, total: count(schema.yardReviews.id) })
        .from(schema.yardReviews)
        .where(eq(schema.yardReviews.yardId, input.yardId))
        .groupBy(schema.yardReviews.verdict);

      const verdictBreakdown = Object.fromEntries(verdictRows.map(r => [r.verdict, Number(r.total)]));

      return {
        prices: prices.map(r => ({
          metalType:  r.metalType,
          pricePerLb: r.pricePerLb,
          source:     r.source,
          verified:   r.verified,
          reportedAt: r.reportedAt.toISOString(),
          ageHours:   Math.round((Date.now() - r.reportedAt.getTime()) / 3_600_000),
          notes:      r.notes,
        })),
        reviews: reviews.map(r => ({
          id:           r.id,
          rating:       r.rating,
          verdict:      r.verdict,
          saleType:     r.saleType,
          offeredPrice: r.offeredPrice,
          actualPrice:  r.actualPrice,
          comment:      r.comment,
          yardResponded: r.yardResponded,
          yardResponse:  r.yardResponse,
          createdAt:    r.createdAt.toISOString(),
        })),
        avgRating:       stats?.avgRating ? Number(Number(stats.avgRating).toFixed(1)) : null,
        reviewCount:     Number(stats?.reviewCount ?? 0),
        verdictBreakdown,
      };
    }),

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
