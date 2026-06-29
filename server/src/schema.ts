import { pgTable, serial, text, real, jsonb, timestamp, uuid, boolean, index } from 'drizzle-orm/pg-core';

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
