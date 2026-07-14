-- Migration 0003: yard reviews
-- Adds yardReviews table — Yelp-style experience ratings after visiting a yard.

CREATE TABLE IF NOT EXISTS "yard_reviews" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "yard_id"         text NOT NULL,
  "user_id"         text,
  "rating"          integer NOT NULL,
  "verdict"         text NOT NULL,
  "sale_type"       text NOT NULL DEFAULT 'metal',
  "offered_price"   real,
  "actual_price"    real,
  "comment"         text,
  "yard_responded"  boolean NOT NULL DEFAULT false,
  "yard_response"   text,
  "created_at"      timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "yr_yard_id_idx"    ON "yard_reviews" ("yard_id");
CREATE INDEX IF NOT EXISTS "yr_created_at_idx" ON "yard_reviews" ("created_at");
