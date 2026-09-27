ALTER TYPE occupant_gender ADD VALUE IF NOT EXISTS 'UNSPECIFIED';

--> statement-breakpoint

ALTER TABLE booking_orders
  ADD COLUMN gift_recipient_name text,
  ADD COLUMN gift_recipient_phone text,
  ADD COLUMN gift_recipient_email text;
