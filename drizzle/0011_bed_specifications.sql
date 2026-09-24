ALTER TABLE accommodation_units
  ADD COLUMN bed_specifications text[] NOT NULL DEFAULT '{}';
