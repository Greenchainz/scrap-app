CREATE TABLE "yard_price_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"yard_id" text NOT NULL,
	"metal_type" text NOT NULL,
	"price_per_lb" real NOT NULL,
	"source" text NOT NULL,
	"user_id" text,
	"notes" text,
	"verified" boolean DEFAULT false NOT NULL,
	"reported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"address" text,
	"phone" text,
	"website" text,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"source" text DEFAULT 'staff' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ypr_yard_id_idx" ON "yard_price_reports" USING btree ("yard_id");--> statement-breakpoint
CREATE INDEX "ypr_reported_at_idx" ON "yard_price_reports" USING btree ("reported_at");--> statement-breakpoint
CREATE INDEX "yards_state_idx" ON "yards" USING btree ("state");--> statement-breakpoint
CREATE INDEX "yards_status_idx" ON "yards" USING btree ("status");