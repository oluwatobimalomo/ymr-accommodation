import "./load-env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { renumberAllBedspaces } from "@/lib/inventory/renumber";

/**
 * One-off data fix: renumbers every room's bedspaces to plain sequential
 * numbers (1, 2, 3, ...), replacing any old letter-based labels (A, B, C...
 * or the old AA/AB overflow scheme) left over from before bedspace
 * numbering was switched to plain numbers. Safe to run more than once.
 */
async function main() {
  const url = process.env.DATABASE_URL_DIRECT;
  if (!url) throw new Error("DATABASE_URL_DIRECT is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle({ client: pool, schema });

  const { roomsChanged, bedspacesChanged } = await renumberAllBedspaces(db);
  console.log(`Renumbered bedspaces in ${roomsChanged} room(s), ${bedspacesChanged} bedspace(s) touched.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
