INSERT INTO facilities (name, sort_order)
VALUES ('Air Conditioner', 0)
ON CONFLICT (name) DO NOTHING;

INSERT INTO unit_facilities (unit_id, facility_id)
SELECT old_link.unit_id, canonical.id
FROM unit_facilities AS old_link
JOIN facilities AS duplicate ON duplicate.id = old_link.facility_id
JOIN facilities AS canonical ON canonical.name = 'Air Conditioner'
WHERE lower(duplicate.name) = 'air conditioning'
ON CONFLICT (unit_id, facility_id) DO NOTHING;

DELETE FROM unit_facilities
WHERE facility_id IN (SELECT id FROM facilities WHERE lower(name) = 'air conditioning');

DELETE FROM facilities WHERE lower(name) = 'air conditioning';
