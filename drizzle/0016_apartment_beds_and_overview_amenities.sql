ALTER TABLE accommodation_units
  ADD COLUMN bed_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN bed_sizes text[] NOT NULL DEFAULT '{}';

UPDATE accommodation_units
SET bed_types = ARRAY(
      SELECT DISTINCT CASE
        WHEN lower(spec) LIKE '%single%' THEN 'Single Bed'
        WHEN lower(spec) LIKE '%double%' THEN 'Double Bed'
        WHEN lower(spec) LIKE '%bunk%' THEN 'Bunk'
      END
      FROM unnest(bed_specifications) AS spec
      WHERE lower(spec) LIKE '%single%' OR lower(spec) LIKE '%double%' OR lower(spec) LIKE '%bunk%'
    ),
    bed_sizes = ARRAY(
      SELECT DISTINCT lower(replace(substring(spec from '[0-9]+[x×][0-9]+'), '×', 'x'))
      FROM unnest(bed_specifications) AS spec
      WHERE lower(spec) ~ '[0-9]+[x×][0-9]+'
    );

CREATE TABLE unit_overview_facilities (
  unit_id uuid NOT NULL REFERENCES accommodation_units(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
  PRIMARY KEY (unit_id, facility_id)
);

-- Keep a useful overview on existing apartments. Staff can tailor it from the
-- apartment editor after migration; only the first three sorted amenities show.
INSERT INTO unit_overview_facilities (unit_id, facility_id)
SELECT unit_id, facility_id
FROM (
  SELECT uf.unit_id, uf.facility_id,
         row_number() OVER (PARTITION BY uf.unit_id ORDER BY f.sort_order, f.name) AS position
  FROM unit_facilities uf
  JOIN facilities f ON f.id = uf.facility_id
  WHERE lower(f.name) <> 'bed'
) selected
WHERE position <= 3;
