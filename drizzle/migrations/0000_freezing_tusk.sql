CREATE TABLE "metal_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"metal_type" text NOT NULL,
	"price_per_lb" real NOT NULL,
	"region" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"object_name" text NOT NULL,
	"analysis" jsonb NOT NULL,
	"estimated_value_low" real NOT NULL,
	"estimated_value_high" real NOT NULL,
	"latitude" real,
	"longitude" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
