import { defineConfig } from "drizzle-kit";

// Migrations use the DIRECT (non-pooled) connection string.
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? "" },
});
