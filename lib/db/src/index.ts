import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Please set your PostgreSQL connection string.",
  );
}

const url = process.env.DATABASE_URL;

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
