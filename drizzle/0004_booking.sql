CREATE TYPE "public"."accommodation_status" AS ENUM('UNALLOCATED', 'ALLOCATED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."allocation_status" AS ENUM('NOT_ALLOCATED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED');--> statement-breakpoint
CREATE TYPE "public"."occupant_gender" AS ENUM('MALE', 'FEMALE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "booking_occupants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"gender" "occupant_gender" NOT NULL,
	"bedspace_id" uuid,
	"room_id" uuid,
	"unit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"category_id" uuid NOT NULL,
	"booker_name" text NOT NULL,
	"booker_phone" text NOT NULL,
	"booker_email" text NOT NULL,
	"occupant_count" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"payment_status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"accommodation_status" "accommodation_status" DEFAULT 'UNALLOCATED' NOT NULL,
	"allocation_status" "allocation_status" DEFAULT 'NOT_ALLOCATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "inventory_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"bedspace_id" uuid,
	"room_id" uuid,
	"unit_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_occupants" ADD CONSTRAINT "booking_occupants_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_occupants" ADD CONSTRAINT "booking_occupants_bedspace_id_bedspaces_id_fk" FOREIGN KEY ("bedspace_id") REFERENCES "public"."bedspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_occupants" ADD CONSTRAINT "booking_occupants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_occupants" ADD CONSTRAINT "booking_occupants_unit_id_accommodation_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."accommodation_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_category_id_accommodation_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."accommodation_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_bedspace_id_bedspaces_id_fk" FOREIGN KEY ("bedspace_id") REFERENCES "public"."bedspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_unit_id_accommodation_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."accommodation_units"("id") ON DELETE cascade ON UPDATE no action;