CREATE TABLE "user_lodge_assignments" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "lodge_id" uuid NOT NULL REFERENCES "lodges"("id") ON DELETE CASCADE,
  "assigned_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "assigned_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_lodge_assignments_user_lodge_pk" PRIMARY KEY ("user_id", "lodge_id")
);
--> statement-breakpoint
CREATE INDEX "user_lodge_assignments_lodge_idx" ON "user_lodge_assignments" USING btree ("lodge_id");
--> statement-breakpoint
UPDATE "roles" SET "name" = 'Lodge Coordinator', "description" = 'Operational guest, booking and support access for assigned lodges only. No financial data.' WHERE "key" = 'accommodation_officer';
--> statement-breakpoint
INSERT INTO "roles" ("key", "name", "description", "lodge_scoped", "is_system")
VALUES ('accommodation_overseer', 'Accommodation Overseer', 'Operational guest, booking and support access across all lodges. No financial data.', false, true)
ON CONFLICT ("key") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "lodge_scoped" = false, "is_system" = true;
--> statement-breakpoint
DELETE FROM "role_permissions" rp USING "roles" r
WHERE rp."role_id" = r."id" AND r."key" IN ('accommodation_officer', 'accommodation_overseer');
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r."id", p."key"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" IN ('accommodation_officer', 'accommodation_overseer')
  AND p."key" IN (
    'booking.read', 'booking.reallocate', 'checkin.perform',
    'checkout.perform', 'keys.read', 'keys.issue', 'keys.return',
    'support.create', 'support.read', 'support.manage'
  );
