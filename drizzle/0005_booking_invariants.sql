-- A hold always targets exactly one thing: a bedspace, a room (private
-- whole-room), or a unit (private whole-unit) — never zero, never more.
ALTER TABLE inventory_holds ADD CONSTRAINT inventory_holds_exactly_one_target CHECK (
  (CASE WHEN bedspace_id IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN room_id IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN unit_id IS NOT NULL THEN 1 ELSE 0 END) = 1
);
--> statement-breakpoint

-- An occupant may be unassigned so far (auto-allocation not yet run), but if
-- assigned, exactly one target column is set.
ALTER TABLE booking_occupants ADD CONSTRAINT booking_occupants_at_most_one_target CHECK (
  (CASE WHEN bedspace_id IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN room_id IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN unit_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
);
--> statement-breakpoint

-- THE core anti-oversell guarantee: at most one active hold row can exist
-- per bedspace/room/unit at a time. Rows are deleted on release, expiry
-- sweep, or conversion, so "a row exists" IS the held state (see
-- src/lib/booking/holds.ts). This index makes a double-hold impossible even
-- if the application's own locking logic has a bug — Postgres enforces it
-- unconditionally at commit time.
CREATE UNIQUE INDEX inventory_holds_bedspace_uq ON inventory_holds (bedspace_id) WHERE bedspace_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX inventory_holds_room_uq ON inventory_holds (room_id) WHERE room_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX inventory_holds_unit_uq ON inventory_holds (unit_id) WHERE unit_id IS NOT NULL;
--> statement-breakpoint

-- Same guarantee at the occupant/allocation level: once an occupant is
-- assigned to a specific bedspace/room/unit, no other occupant row can be
-- assigned to that same one. This is what makes "the same physical room
-- effectively allocated twice" (the brief's core complaint) structurally
-- impossible rather than merely discouraged.
CREATE UNIQUE INDEX booking_occupants_bedspace_uq ON booking_occupants (bedspace_id) WHERE bedspace_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX booking_occupants_room_uq ON booking_occupants (room_id) WHERE room_id IS NOT NULL;
--> statement-breakpoint
-- Units are the exception: a private WHOLE-UNIT booking can have multiple
-- occupants sharing the same unit_id by design, so no uniqueness here.

-- An occupant's gender must agree with the gender restriction of whatever
-- room they're assigned to (bedspace's room, or a directly-assigned room).
-- Unit-level (private, no room breakdown) assignments have no gender check
-- here since accommodation_units carries no gender column of its own.
CREATE FUNCTION check_occupant_gender_matches_room() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_room_id uuid;
  room_gender gender_restriction;
BEGIN
  IF NEW.bedspace_id IS NOT NULL THEN
    SELECT room_id INTO target_room_id FROM bedspaces WHERE id = NEW.bedspace_id;
  ELSIF NEW.room_id IS NOT NULL THEN
    target_room_id := NEW.room_id;
  ELSE
    RETURN NEW;
  END IF;

  SELECT gender_restriction INTO room_gender FROM rooms WHERE id = target_room_id;
  IF room_gender IN ('MALE', 'FEMALE') AND NEW.gender::text <> room_gender::text THEN
    RAISE EXCEPTION 'occupant gender (%) does not match room gender restriction (%)', NEW.gender, room_gender;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER booking_occupants_check_gender
  BEFORE INSERT OR UPDATE OF bedspace_id, room_id, gender ON booking_occupants
  FOR EACH ROW EXECUTE FUNCTION check_occupant_gender_matches_room();
