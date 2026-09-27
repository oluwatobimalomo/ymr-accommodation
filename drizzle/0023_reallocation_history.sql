CREATE TABLE "reallocation_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE RESTRICT,
  "occupant_id" uuid NOT NULL REFERENCES "booking_occupants"("id") ON DELETE RESTRICT,
  "from_bedspace_id" uuid NOT NULL REFERENCES "bedspaces"("id") ON DELETE RESTRICT,
  "to_bedspace_id" uuid NOT NULL REFERENCES "bedspaces"("id") ON DELETE RESTRICT,
  "reason" text NOT NULL,
  "moved_at" timestamptz DEFAULT now() NOT NULL,
  "moved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX "reallocation_history_booking_idx" ON "reallocation_history" USING btree ("booking_id", "moved_at");
--> statement-breakpoint
CREATE INDEX "reallocation_history_occupant_idx" ON "reallocation_history" USING btree ("occupant_id", "moved_at");
--> statement-breakpoint
CREATE FUNCTION reallocation_history_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'reallocation_history is append-only (% not allowed)', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reallocation_history_no_update_delete
  BEFORE UPDATE OR DELETE ON reallocation_history
  FOR EACH ROW EXECUTE FUNCTION reallocation_history_immutable();
--> statement-breakpoint
CREATE TRIGGER reallocation_history_no_truncate
  BEFORE TRUNCATE ON reallocation_history
  FOR EACH STATEMENT EXECUTE FUNCTION reallocation_history_immutable();
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "roles"."id", 'booking.reallocate'
FROM "roles"
WHERE "roles"."key" = 'accommodation_officer'
  AND EXISTS (SELECT 1 FROM "permissions" WHERE "permissions"."key" = 'booking.reallocate')
ON CONFLICT DO NOTHING;
