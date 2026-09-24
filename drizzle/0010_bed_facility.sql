INSERT INTO facilities (name, icon, sort_order)
VALUES ('Bed', 'bed', 0)
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint

INSERT INTO unit_facilities (unit_id, facility_id)
SELECT au.id, f.id
FROM accommodation_units au
CROSS JOIN facilities f
WHERE lower(f.name) = 'bed'
ON CONFLICT (unit_id, facility_id) DO NOTHING;
