ALTER TABLE accommodation_categories
  ADD COLUMN check_in_date date,
  ADD COLUMN check_out_date date;

ALTER TABLE accommodation_categories
  ADD CONSTRAINT accommodation_categories_stay_dates_check
  CHECK (check_in_date IS NULL OR check_out_date IS NULL OR check_out_date > check_in_date);
