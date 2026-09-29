CREATE TABLE IF NOT EXISTS "public_request_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_request_limits_expires_idx" ON "public_request_limits" USING btree ("expires_at");
