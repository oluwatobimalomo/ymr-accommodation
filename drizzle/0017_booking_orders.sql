CREATE TABLE booking_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  booker_name text NOT NULL,
  booker_phone text NOT NULL,
  booker_email text NOT NULL,
  amount_minor integer NOT NULL,
  currency text NOT NULL,
  payment_status payment_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bookings
  ADD COLUMN checkout_order_id uuid REFERENCES booking_orders(id) ON DELETE RESTRICT;

ALTER TABLE payment_transactions
  ADD COLUMN checkout_order_id uuid REFERENCES booking_orders(id) ON DELETE RESTRICT;

CREATE INDEX bookings_checkout_order_idx ON bookings(checkout_order_id);
CREATE INDEX payment_transactions_checkout_order_idx ON payment_transactions(checkout_order_id);
