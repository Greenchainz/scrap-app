import { pgTable, serial, text, real, jsonb, timestamp } from 'drizzle-orm/pg-core';

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
