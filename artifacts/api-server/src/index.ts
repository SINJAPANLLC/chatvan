import app from "./app";
import { logger } from "./lib/logger";
import { seedRequiredAccounts } from "./lib/seed";
import { startScheduler } from "./lib/blogAutoGen";
import { startAutoProspect } from "./lib/autoProspect";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function runMigrations() {
  try {
    await db.execute(sql`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS master_card_data TEXT`);
    await db.execute(sql`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS stops_json TEXT`);
    logger.info("migration: master_card_data / stops_json columns ready");
  } catch (e: any) {
    logger.warn({ err: e.message }, "migration warning (non-fatal)");
  }
}

const port = Number(process.env.PORT ?? 8080);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  runMigrations();
  seedRequiredAccounts();
  startScheduler();
  startAutoProspect();
});
