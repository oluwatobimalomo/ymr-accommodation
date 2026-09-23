CREATE TABLE "private_unit_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"release_reason" text
);
--> statement-breakpoint
ALTER TABLE "private_unit_allocations" ADD CONSTRAINT "private_unit_allocations_unit_id_accommodation_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."accommodation_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_unit_allocations" ADD CONSTRAINT "private_unit_allocations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION check_private_unit_allocation_matches_booking() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  unit_category_id uuid;
  unit_event_id uuid;
  unit_mode accommodation_mode;
  booking_category_id uuid;
  booking_event_id uuid;
BEGIN
  SELECT ac.id, l.event_id, ac.mode INTO unit_category_id, unit_event_id, unit_mode
  FROM accommodation_units au
  JOIN accommodation_categories ac ON ac.id = au.category_id
  JOIN lodges l ON l.id = ac.lodge_id
  WHERE au.id = NEW.unit_id;
  SELECT category_id, event_id INTO booking_category_id, booking_event_id
  FROM bookings WHERE id = NEW.booking_id;

  IF unit_mode <> 'PRIVATE' OR unit_category_id <> booking_category_id OR unit_event_id <> booking_event_id THEN
    RAISE EXCEPTION 'private unit allocation must match a private unit and booking in the same category and event';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER private_unit_allocations_validate_target
  BEFORE INSERT OR UPDATE OF unit_id, booking_id ON private_unit_allocations
  FOR EACH ROW EXECUTE FUNCTION check_private_unit_allocation_matches_booking();--> statement-breakpoint
-- Refuse an ambiguous backfill rather than silently assigning one existing
-- paid booking's unit to another. Resolve any reported duplicates before deploy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM booking_occupants bo
    JOIN bookings b ON b.id = bo.booking_id
    JOIN accommodation_units au ON au.id = bo.unit_id
    JOIN accommodation_categories ac ON ac.id = au.category_id
    WHERE bo.unit_id IS NOT NULL
      AND ac.mode = 'PRIVATE'
      AND (
        (b.payment_status = 'PAID' AND b.accommodation_status <> 'CANCELLED')
        OR (b.payment_status = 'PENDING' AND EXISTS (
          SELECT 1 FROM inventory_holds h
          WHERE h.booking_id = b.id AND h.unit_id = bo.unit_id AND h.expires_at > now()
        ))
      )
    GROUP BY bo.unit_id
    HAVING COUNT(DISTINCT b.id) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot backfill private unit allocations: existing unit is assigned to multiple active bookings. Resolve duplicate allocations before applying migration 0009.';
  END IF;
END $$;--> statement-breakpoint
-- Preserve existing paid allocations and pending bookings whose holds remain live.
INSERT INTO private_unit_allocations (unit_id, booking_id)
SELECT DISTINCT bo.unit_id, bo.booking_id
FROM booking_occupants bo
JOIN bookings b ON b.id = bo.booking_id
JOIN accommodation_units au ON au.id = bo.unit_id
JOIN accommodation_categories ac ON ac.id = au.category_id
WHERE bo.unit_id IS NOT NULL
  AND ac.mode = 'PRIVATE'
  AND (
    (b.payment_status = 'PAID' AND b.accommodation_status <> 'CANCELLED')
    OR (b.payment_status = 'PENDING' AND EXISTS (
      SELECT 1 FROM inventory_holds h
      WHERE h.booking_id = b.id AND h.unit_id = bo.unit_id AND h.expires_at > now()
    ))
  );--> statement-breakpoint
-- Detect historical duplicate Paystack transaction IDs before creating the index.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payment_transactions
    WHERE paystack_transaction_id IS NOT NULL
    GROUP BY paystack_transaction_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add Paystack transaction uniqueness: duplicate paystack_transaction_id values exist. Resolve duplicate payment rows before applying migration 0009.';
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "private_unit_allocations_active_unit_uq" ON "private_unit_allocations" USING btree ("unit_id") WHERE "private_unit_allocations"."released_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "private_unit_allocations_booking_unit_uq" ON "private_unit_allocations" USING btree ("booking_id","unit_id");--> statement-breakpoint
CREATE INDEX "private_unit_allocations_booking_idx" ON "private_unit_allocations" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_paystack_id_uq" ON "payment_transactions" USING btree ("paystack_transaction_id") WHERE "payment_transactions"."paystack_transaction_id" is not null;
--> statement-breakpoint
-- Keep the durable claim synchronized even for future code paths that write
-- occupant assignments without calling today's booking service.
CREATE FUNCTION sync_private_unit_allocation_from_occupant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_unit_id uuid;
  old_booking_id uuid;
  new_unit_id uuid;
  new_booking_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_unit_id := OLD.unit_id;
    old_booking_id := OLD.booking_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_unit_id := NEW.unit_id;
    new_booking_id := NEW.booking_id;
  END IF;

  IF old_unit_id IS NOT NULL AND (TG_OP = 'DELETE' OR old_unit_id IS DISTINCT FROM new_unit_id OR old_booking_id IS DISTINCT FROM new_booking_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM booking_occupants bo
      WHERE bo.booking_id = old_booking_id AND bo.unit_id = old_unit_id
        AND (TG_OP = 'DELETE' OR bo.id <> OLD.id)
    ) THEN
      UPDATE private_unit_allocations
      SET released_at = now(), release_reason = 'occupant unit assignment removed'
      WHERE booking_id = old_booking_id AND unit_id = old_unit_id AND released_at IS NULL;
    END IF;
  END IF;

  IF new_unit_id IS NOT NULL THEN
    INSERT INTO private_unit_allocations (unit_id, booking_id)
    VALUES (new_unit_id, new_booking_id)
    ON CONFLICT (booking_id, unit_id) DO UPDATE
      SET released_at = NULL, release_reason = NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER booking_occupants_sync_private_unit_allocation
  AFTER INSERT OR UPDATE OF unit_id, booking_id OR DELETE ON booking_occupants
  FOR EACH ROW EXECUTE FUNCTION sync_private_unit_allocation_from_occupant();
