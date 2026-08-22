import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// アプリ実行中は既存DBを優先し、Neonへの本切り替えはスキーマ・データ移行後に行う。
const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!url) {
  throw new Error(
    "NEON_DATABASE_URL or DATABASE_URL must be set. Please set your PostgreSQL connection string.",
  );
}

// Neon / Supabase など外部DBはSSL必須。ローカル / Replit内部DBはSSL不要。
const needsSsl = url.includes("neon.tech") ||
                 url.includes("supabase.co") ||
                 url.includes("amazonaws.com") ||
                 url.includes("sslmode=require");

export const pool = new Pool({
  connectionString: url,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const db = drizzle(pool, { schema });

export * from "./schema";
