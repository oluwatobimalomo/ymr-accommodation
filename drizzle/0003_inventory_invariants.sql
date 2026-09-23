-- A bedspace letter is unique within its room (A, B, C... never duplicated).
CREATE UNIQUE INDEX bedspaces_room_letter_uq ON bedspaces (room_id, letter);
--> statement-breakpoint

-- Every bedspace change recomputes its room's capacity, so the two can
-- never drift apart. RETIRED bedspaces don't count toward capacity.
-- A room with zero bedspace rows keeps whatever capacity was set directly
-- (this is how a private, non-bedspace room's capacity stays admin-controlled).
CREATE FUNCTION sync_room_capacity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  affected_room_id uuid;
BEGIN
  affected_room_id := COALESCE(NEW.room_id, OLD.room_id);
  UPDATE rooms
    SET capacity = (
      SELECT COUNT(*) FROM bedspaces
      WHERE room_id = affected_room_id AND status <> 'RETIRED'
    )
    WHERE id = affected_room_id
      AND EXISTS (SELECT 1 FROM bedspaces WHERE room_id = affected_room_id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bedspaces_sync_room_capacity
  AFTER INSERT OR UPDATE OF status OR DELETE ON bedspaces
  FOR EACH ROW EXECUTE FUNCTION sync_room_capacity();
--> statement-breakpoint

-- Every room change recomputes its parent unit's capacity as the sum of that
-- unit's room capacities. A unit with zero room rows (e.g. a private chalet
-- booked as a whole, with no room/bedspace breakdown) keeps its own
-- admin-set capacity untouched.
CREATE FUNCTION sync_unit_capacity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  affected_unit_id uuid;
BEGIN
  affected_unit_id := COALESCE(NEW.unit_id, OLD.unit_id);
  UPDATE accommodation_units
    SET capacity = (
      SELECT COALESCE(SUM(capacity), 0) FROM rooms WHERE unit_id = affected_unit_id
    )
    WHERE id = affected_unit_id
      AND EXISTS (SELECT 1 FROM rooms WHERE unit_id = affected_unit_id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER rooms_sync_unit_capacity
  AFTER INSERT OR UPDATE OF capacity OR DELETE ON rooms
  FOR EACH ROW EXECUTE FUNCTION sync_unit_capacity();
--> statement-breakpoint
-- This also cascades correctly when the bedspace trigger above recomputes a
-- room's capacity: that UPDATE touches `capacity`, which fires this trigger
-- on the parent unit in turn, with no separate wiring needed.

-- A room's gender restriction must agree with its category's, whenever the
-- category itself restricts gender. A category left at ANY lets its rooms
-- set their own restriction individually (e.g. one "Shared" category with
-- some male rooms and some female rooms).
CREATE FUNCTION check_room_gender_matches_category() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  category_gender gender_restriction;
BEGIN
  SELECT ac.gender_restriction INTO category_gender
  FROM accommodation_units au
  JOIN accommodation_categories ac ON ac.id = au.category_id
  WHERE au.id = NEW.unit_id;

  IF category_gender IN ('MALE', 'FEMALE') AND NEW.gender_restriction <> category_gender THEN
    RAISE EXCEPTION 'room gender_restriction (%) must match its category (%)', NEW.gender_restriction, category_gender;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER rooms_check_gender_matches_category
  BEFORE INSERT OR UPDATE OF gender_restriction, unit_id ON rooms
  FOR EACH ROW EXECUTE FUNCTION check_room_gender_matches_category();
