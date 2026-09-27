CREATE INDEX IF NOT EXISTS "bookings_created_at_idx" ON "bookings" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_category_created_idx" ON "bookings" USING btree ("category_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_event_created_idx" ON "bookings" USING btree ("event_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_payment_created_idx" ON "bookings" USING btree ("payment_status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_occupants_booking_id_idx" ON "booking_occupants" USING btree ("booking_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_occupants_bedspace_idx" ON "booking_occupants" USING btree ("bedspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_holds_expires_at_idx" ON "inventory_holds" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_holds_bedspace_idx" ON "inventory_holds" USING btree ("bedspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_holds_room_idx" ON "inventory_holds" USING btree ("room_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_holds_unit_idx" ON "inventory_holds" USING btree ("unit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_status_created_idx" ON "support_tickets" USING btree ("status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_booking_idx" ON "support_tickets" USING btree ("booking_id");
