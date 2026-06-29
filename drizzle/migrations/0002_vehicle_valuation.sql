-- Migration 0002: vehicle valuation flow
-- Adds yard_type + buys_cars to yards table.
-- Creates vehicle_valuation_logs table.

-- ─── yards: new columns ───────────────────────────────────────────────────────

ALTER TABLE "yards"
  ADD COLUMN IF NOT EXISTS "yard_type" text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "buys_cars" boolean NOT NULL DEFAULT false;

-- ─── vehicle_valuation_logs ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "vehicle_valuation_logs" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vehicle_class"    text NOT NULL,
  "make"             text,
  "year"             integer,
  "condition"        text NOT NULL,
  "has_cat_converter" boolean NOT NULL,
  "cat_type"         text NOT NULL,
  "estimate_low"     real NOT NULL,
  "estimate_high"    real NOT NULL,
  "latitude"         real,
  "longitude"        real,
  "state"            text,
  "user_id"          text,
  "created_at"       timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "vvl_state_idx"      ON "vehicle_valuation_logs" ("state");
CREATE INDEX IF NOT EXISTS "vvl_created_at_idx" ON "vehicle_valuation_logs" ("created_at");
