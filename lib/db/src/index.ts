import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseTarget = (process.env.CHAT_VAN_DB_TARGET || "neon").trim().toLowerCase();
if (databaseTarget !== "neon" && databaseTarget !== "legacy") {
  throw new Error("CHAT_VAN_DB_TARGET must be either 'neon' or 'legacy'");
}

// Neonを通常接続先とし、旧DBへの切り戻しは明示的な運用設定がある場合だけ許可する。
const url = databaseTarget === "neon"
  ? process.env.NEON_DATABASE_URL
  : process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    `${databaseTarget === "neon" ? "NEON_DATABASE_URL" : "DATABASE_URL"} must be set for CHAT_VAN_DB_TARGET=${databaseTarget}.`,
  );
}

// 外部DBはTLS証明書を検証する。ローカル／Replit内部DBは接続文字列の設定に従う。
const needsSsl = url.includes("neon.tech") ||
                 url.includes("supabase.co") ||
                 url.includes("amazonaws.com") ||
                 url.includes("sslmode=require");

export const pool = new Pool({
  connectionString: url,
  ...(needsSsl ? { ssl: { rejectUnauthorized: true } } : {}),
});

export const db = drizzle(pool, { schema });

export async function assertDatabaseReady() {
  const result = await pool.query<{
    current_schema: string | null;
    search_path: string;
    users_table: string | null;
    sessions_table: string | null;
  }>(`
    SELECT
      current_schema() AS current_schema,
      current_setting('search_path') AS search_path,
      to_regclass('public.users')::text AS users_table,
      to_regclass('public.sessions')::text AS sessions_table
  `);
  const state = result.rows[0];

  if (
    state?.current_schema !== "public" ||
    state.users_table !== "users" ||
    state.sessions_table !== "sessions"
  ) {
    throw new Error(
      `Database preflight failed: expected public schema with users and sessions tables (schema=${state?.current_schema ?? "unknown"}, search_path=${state?.search_path ?? "unknown"}).`,
    );
  }
}

export * from "./schema";
