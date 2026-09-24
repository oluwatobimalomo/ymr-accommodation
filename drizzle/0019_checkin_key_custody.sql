CREATE TYPE key_custody_status AS ENUM ('ISSUED', 'RETURNED', 'MISSING');

CREATE TABLE key_custody (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  lodge_id uuid NOT NULL REFERENCES lodges(id) ON DELETE RESTRICT,
  occupant_id uuid NOT NULL REFERENCES booking_occupants(id) ON DELETE RESTRICT,
  key_label text NOT NULL,
  status key_custody_status NOT NULL DEFAULT 'ISSUED',
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid REFERENCES users(id) ON DELETE SET NULL,
  returned_at timestamptz,
  returned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  missing_at timestamptz,
  missing_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT ''
);

CREATE INDEX key_custody_booking_idx ON key_custody (booking_id, issued_at);
CREATE INDEX key_custody_occupant_idx ON key_custody (occupant_id, issued_at);
CREATE UNIQUE INDEX key_custody_open_label_uq ON key_custody (lodge_id, lower(key_label)) WHERE status = 'ISSUED';
CREATE UNIQUE INDEX key_custody_open_occupant_uq ON key_custody (occupant_id) WHERE status = 'ISSUED';
