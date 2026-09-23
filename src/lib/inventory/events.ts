import { getDb } from "@/db/client";
import { events } from "@/db/schema";

/** Read-only listing for admin dropdowns; full event management (create/edit) is a later phase. */
export async function listEvents() {
  return getDb().select().from(events).orderBy(events.year);
}
