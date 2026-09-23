CREATE TYPE "public"."accommodation_mode" AS ENUM('PRIVATE', 'SHARED');--> statement-breakpoint
CREATE TYPE "public"."bedspace_status" AS ENUM('AVAILABLE', 'BLOCKED', 'MAINTENANCE', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."category_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."gender_restriction" AS ENUM('ANY', 'MALE', 'FEMALE');--> statement-breakpoint
CREATE TYPE "public"."lodge_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."pricing_model" AS ENUM('PER_UNIT', 'PER_PERSON');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE');--> statement-breakpoint
CREATE TABLE "accommodation_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lodge_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" "accommodation_mode" NOT NULL,
	"gender_restriction" "gender_restriction" DEFAULT 'ANY' NOT NULL,
	"pricing_model" "pricing_model" NOT NULL,
	"default_price_minor" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"customer_selects_room" boolean DEFAULT true NOT NULL,
	"customer_selects_bedspace" boolean DEFAULT true NOT NULL,
	"allow_entire_room_booking" boolean DEFAULT false NOT NULL,
	"status" "category_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accommodation_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"images" text[] DEFAULT '{}' NOT NULL,
	"status" "unit_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bedspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"letter" text NOT NULL,
	"status" "bedspace_status" DEFAULT 'AVAILABLE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "facilities_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "lodges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"images" text[] DEFAULT '{}' NOT NULL,
	"status" "lodge_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lodges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"gender_restriction" "gender_restriction" DEFAULT 'ANY' NOT NULL,
	"status" "room_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_facilities" (
	"unit_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	CONSTRAINT "unit_facilities_unit_id_facility_id_pk" PRIMARY KEY("unit_id","facility_id")
);
--> statement-breakpoint
ALTER TABLE "accommodation_categories" ADD CONSTRAINT "accommodation_categories_lodge_id_lodges_id_fk" FOREIGN KEY ("lodge_id") REFERENCES "public"."lodges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_units" ADD CONSTRAINT "accommodation_units_category_id_accommodation_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."accommodation_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bedspaces" ADD CONSTRAINT "bedspaces_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lodges" ADD CONSTRAINT "lodges_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_unit_id_accommodation_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."accommodation_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_facilities" ADD CONSTRAINT "unit_facilities_unit_id_accommodation_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."accommodation_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_facilities" ADD CONSTRAINT "unit_facilities_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;