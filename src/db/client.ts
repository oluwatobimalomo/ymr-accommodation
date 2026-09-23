import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Plain TCP Postgres (node-postgres) against Neon's POOLED connection string.
 * Supports full interactive transactions (SELECT ... FOR UPDATE then INSERT),
 * which the booking/allocation logic requires. Chosen over the WebSocket-based
 * @neondatabase/serverless driver to avoid its `ws`/`bufferutil` native-module
 * dependency, and because it's Neon's current recommendation for Vercel with
 * Fluid compute (see docs.neon.tech: Vercel connection methods).
 */
type Db = ReturnType<typeof create>;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 5 });
  return drizzle({ client: pool, schema });
}

let instance: Db | undefined;

/** Lazily created so `next build` does not need a database. */
export function getDb(): Db {
  instance ??= create();
  return instance;
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
