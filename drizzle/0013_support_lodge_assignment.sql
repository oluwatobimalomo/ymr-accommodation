ALTER TABLE support_tickets
  ADD COLUMN lodge_id uuid REFERENCES lodges(id) ON DELETE SET NULL;

CREATE INDEX support_tickets_lodge_id_idx ON support_tickets(lodge_id);
