CREATE TYPE "public"."coupon_redemption_status" AS ENUM('RESERVED', 'REDEEMED');--> statement-breakpoint
CREATE TYPE "public"."coupon_status" AS ENUM('ACTIVE', 'PAUSED');--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"booking_order_id" uuid,
	"booking_id" uuid,
	"email_normalized" text NOT NULL,
	"phone_normalized" text NOT NULL,
	"discount_minor" integer NOT NULL,
	"status" "coupon_redemption_status" DEFAULT 'RESERVED' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone,
	CONSTRAINT "coupon_redemptions_one_target_check" CHECK (("coupon_redemptions"."booking_order_id" is null) <> ("coupon_redemptions"."booking_id" is null)),
	CONSTRAINT "coupon_redemptions_discount_check" CHECK ("coupon_redemptions"."discount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"code" text NOT NULL,
	"discount_percent" integer NOT NULL,
	"max_discount_minor" integer,
	"min_subtotal_minor" integer DEFAULT 0 NOT NULL,
	"max_redemptions" integer NOT NULL,
	"max_per_attendee" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "coupon_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_discount_percent_check" CHECK ("coupons"."discount_percent" between 1 and 90),
	CONSTRAINT "coupons_max_discount_check" CHECK ("coupons"."max_discount_minor" is null or "coupons"."max_discount_minor" > 0),
	CONSTRAINT "coupons_minimum_check" CHECK ("coupons"."min_subtotal_minor" >= 0),
	CONSTRAINT "coupons_limits_check" CHECK ("coupons"."max_redemptions" > 0 and "coupons"."max_per_attendee" > 0),
	CONSTRAINT "coupons_window_check" CHECK ("coupons"."expires_at" > "coupons"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "discount_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "booking_orders" ADD COLUMN "subtotal_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_orders" ADD COLUMN "discount_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_orders" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_booking_order_id_booking_orders_id_fk" FOREIGN KEY ("booking_order_id") REFERENCES "public"."booking_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_order_uq" ON "coupon_redemptions" USING btree ("booking_order_id") WHERE "coupon_redemptions"."booking_order_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_booking_uq" ON "coupon_redemptions" USING btree ("booking_id") WHERE "coupon_redemptions"."booking_id" is not null;--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_status_expiry_idx" ON "coupon_redemptions" USING btree ("coupon_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_attendee_idx" ON "coupon_redemptions" USING btree ("coupon_id","email_normalized");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_phone_idx" ON "coupon_redemptions" USING btree ("coupon_id","phone_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_uq" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coupons_event_status_idx" ON "coupons" USING btree ("event_id","status");
--> statement-breakpoint
INSERT INTO "permissions" ("key", "description")
VALUES ('coupon.manage', 'Create and manage attendee discount codes')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "roles"."id", 'coupon.manage'
FROM "roles"
WHERE "roles"."key" IN ('super_admin', 'accommodation_admin')
ON CONFLICT DO NOTHING;
