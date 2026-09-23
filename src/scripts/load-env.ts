import { config } from "dotenv";
import { existsSync } from "node:fs";

/**
 * next dev/build load .env.local automatically; these standalone scripts
 * (run via tsx, outside Next.js) do not, so we load it explicitly here.
 * .env.local takes precedence; .env is loaded as a fallback for anything missing.
 */
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) config({ path: file });
}
