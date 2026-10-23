CREATE TYPE "public"."coupon_discount_type" AS ENUM('PERCENTAGE', 'FIXED');--> statement-breakpoint
CREATE TABLE "coupon_categories" (
	"coupon_id" uuid NOT NULL,
	"category_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupons" DROP CONSTRAINT "coupons_discount_percent_check";--> statement-breakpoint
ALTER TABLE "coupons" ALTER COLUMN "discount_percent" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "discount_type" "coupon_discount_type" DEFAULT 'PERCENTAGE' NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "fixed_discount_minor" integer;--> statement-breakpoint
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_category_id_accommodation_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."accommodation_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_categories_pk" ON "coupon_categories" USING btree ("coupon_id","category_id");--> statement-breakpoint
CREATE INDEX "coupon_categories_category_idx" ON "coupon_categories" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_discount_value_check" CHECK (("coupons"."discount_type" = 'PERCENTAGE' and "coupons"."discount_percent" between 1 and 90 and "coupons"."fixed_discount_minor" is null) or ("coupons"."discount_type" = 'FIXED' and "coupons"."fixed_discount_minor" > 0 and "coupons"."discount_percent" is null));