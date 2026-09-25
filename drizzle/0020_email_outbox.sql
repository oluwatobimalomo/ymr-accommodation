CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_status_check" CHECK ("status" IN ('PENDING', 'SENDING', 'SENT', 'FAILED'))
);
CREATE UNIQUE INDEX "email_outbox_dedupe_key_uq" ON "email_outbox" USING btree ("dedupe_key");
CREATE INDEX "email_outbox_pending_idx" ON "email_outbox" USING btree ("status", "next_attempt_at");
