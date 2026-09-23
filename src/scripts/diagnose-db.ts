import "./load-env";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL_DIRECT;
  if (!url) throw new Error("DATABASE_URL_DIRECT is not set");
  const pool = new Pool({ connectionString: url, max: 1 });

  console.log("=== Connected to ===");
  const { rows: dbInfo } = await pool.query("select current_database(), current_user, inet_server_addr()");
  console.log(dbInfo);

  console.log("\n=== Tables in public schema ===");
  const { rows: tables } = await pool.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  console.log(tables.map((r) => r.table_name));

  console.log("\n=== Drizzle migration tracking ===");
  try {
    const { rows: migrations } = await pool.query(
      "select id, hash, created_at from drizzle.__drizzle_migrations order by created_at",
    );
    console.log(migrations);
  } catch (e) {
    console.log("Could not read drizzle.__drizzle_migrations:", (e as Error).message);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
