ALTER TABLE "accommodation_categories"
  ADD COLUMN "min_order_quantity" integer NOT NULL DEFAULT 1,
  ADD COLUMN "max_order_quantity" integer,
  ADD COLUMN "low_stock_alert" integer NOT NULL DEFAULT 3;

ALTER TABLE "accommodation_categories"
  ADD CONSTRAINT "accommodation_categories_min_order_check" CHECK ("min_order_quantity" > 0),
  ADD CONSTRAINT "accommodation_categories_max_order_check" CHECK ("max_order_quantity" IS NULL OR "max_order_quantity" >= "min_order_quantity"),
  ADD CONSTRAINT "accommodation_categories_low_stock_check" CHECK ("low_stock_alert" >= 0);

ALTER TABLE "email_outbox" ADD COLUMN "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb;
