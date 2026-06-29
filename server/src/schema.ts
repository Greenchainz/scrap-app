import { pgTable, serial, text, real, jsonb, timestamp, uuid, boolean, integer, index } from 'drizzle-orm/pg-core';

export const scans = pgTable('scans', {
  id: serial('id').primaryKey(),
  imageUrl: text('image_url').notNull(),
  objectName: text('object_name').notNull(),
  analysis: jsonb('analysis').notNull(),
  estimatedValueLow: real('estimated_value_low').notNull(),
  estimatedValueHigh: real('estimated_value_high').notNull(),
  latitude: real('latitude'),
  longitude: real('longitude'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const metalPrices = pgTable('metal_prices', {
  id: serial('id').primaryKey(),
  metalType: text('metal_type').notNull(),
  pricePerLb: real('price_per_lb').notNull(),
  region: text('region').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Real yard directory — populated by staff calls + yard self-claiming.
// Seed/demo yards stay in yards.ts (in-memory) during MVP; migrate them here later.
export const yards = pgTable('yards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  address: text('address'),
  phone: text('phone'),
  website: text('website'),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  // 'active' | 'unverified' | 'claimed' | 'closed'
  status: text('status').notNull().default('unverified'),
  // 'staff' | 'scraped' | 'claimed'
  source: text('source').notNull().default('staff'),
  // 'full_service' | 'pick_and_pull' | 'shredder' | 'unknown'
  yardType: text('yard_type').notNull().default('unknown'),
  // whether this yard purchases whole end-of-life vehicles
  buysCars: boolean('buys_cars').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('yards_state_idx').on(t.state),
  index('yards_status_idx').on(t.status),
]);

// Crowd-sourced + staff-called + scraped price reports.
// yardId is text (not FK) — works with both seed data IDs ('nyc-01') and DB UUIDs.
export const yardPriceReports = pgTable('yard_price_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  yardId: text('yard_id').notNull(),
  metalType: text('metal_type').notNull(),
  pricePerLb: real('price_per_lb').notNull(),
  // 'user' | 'staff' | 'scraped'
  source: text('source').notNull(),
  userId: text('user_id'),
  notes: text('notes'),
  verified: boolean('verified').notNull().default(false),
  reportedAt: timestamp('reported_at').defaultNow().notNull(),
}, (t) => [
  index('ypr_yard_id_idx').on(t.yardId),
  index('ypr_reported_at_idx').on(t.reportedAt),
]);

export type Yard = typeof yards.$inferSelect;
export type NewYard = typeof yards.$inferInsert;
export type YardPriceReport = typeof yardPriceReports.$inferSelect;
export type NewYardPriceReport = typeof yardPriceReports.$inferInsert;

// ─── Vehicle valuation logs ───────────────────────────────────────────────────
// Analytics: every time a user estimates their car value, we log it.
// Helps identify high-demand markets + improve estimates over time.

export const vehicleValuationLogs = pgTable('vehicle_valuation_logs', {
  id:              uuid('id').primaryKey().defaultRandom(),
  vehicleClass:    text('vehicle_class').notNull(),
  make:            text('make'),
  year:            integer('year'),
  condition:       text('condition').notNull(),
  hasCatConverter: boolean('has_cat_converter').notNull(),
  catType:         text('cat_type').notNull(),
  estimateLow:     real('estimate_low').notNull(),
  estimateHigh:    real('estimate_high').notNull(),
  latitude:        real('latitude'),
  longitude:       real('longitude'),
  state:           text('state'),
  userId:          text('user_id'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('vvl_state_idx').on(t.state),
  index('vvl_created_at_idx').on(t.createdAt),
]);

export type VehicleValuationLog = typeof vehicleValuationLogs.$inferSelect;
export type NewVehicleValuationLog = typeof vehicleValuationLogs.$inferInsert;

// ─── Yard reviews ─────────────────────────────────────────────────────────────
// Yelp-style: user rates their experience after visiting a yard.
// Separate from price reports — captures fairness + experience, not just price.

export const yardReviews = pgTable('yard_reviews', {
  id:           uuid('id').primaryKey().defaultRandom(),
  yardId:       text('yard_id').notNull(),
  userId:       text('user_id'),
  // 1–5 stars
  rating:       integer('rating').notNull(),
  // 'fair' | 'lowballed' | 'fair_but_slow' | 'great' | 'avoid'
  verdict:      text('verdict').notNull(),
  // What they were selling: 'metal' | 'whole_car' | 'catalytic_converter' | 'parts'
  saleType:     text('sale_type').notNull().default('metal'),
  // Optional: what they expected vs got (for cars)
  offeredPrice: real('offered_price'),
  actualPrice:  real('actual_price'),
  comment:      text('comment'),
  // Whether the yard responded to this review
  yardResponded: boolean('yard_responded').notNull().default(false),
  yardResponse:  text('yard_response'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('yr_yard_id_idx').on(t.yardId),
  index('yr_created_at_idx').on(t.createdAt),
]);

export type YardReview = typeof yardReviews.$inferSelect;
export type NewYardReview = typeof yardReviews.$inferInsert;
