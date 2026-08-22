import pg from "pg";

function getSeedDatabaseUrl() {
  const target = (process.env.CHAT_VAN_DB_TARGET || "neon").trim().toLowerCase();
  if (target !== "neon" && target !== "legacy") {
    throw new Error("CHAT_VAN_DB_TARGET must be either 'neon' or 'legacy'");
  }

  const url = target === "neon"
    ? process.env.NEON_DATABASE_URL
    : process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      `${target === "neon" ? "NEON_DATABASE_URL" : "DATABASE_URL"} must be set for CHAT_VAN_DB_TARGET=${target}`,
    );
  }

  return url;
}

export function createSeedClient() {
  const connectionString = getSeedDatabaseUrl();
  const needsSsl = connectionString.includes("neon.tech") ||
    connectionString.includes("supabase.co") ||
    connectionString.includes("amazonaws.com") ||
    connectionString.includes("sslmode=require");

  return new pg.Client({
    connectionString,
    ...(needsSsl ? { ssl: { rejectUnauthorized: true } } : {}),
  });
}