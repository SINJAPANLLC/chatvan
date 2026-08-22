import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseTarget = (process.env.CHAT_VAN_DB_TARGET || "neon").trim().toLowerCase();
if (databaseTarget !== "neon" && databaseTarget !== "legacy") {
  throw new Error("CHAT_VAN_DB_TARGET must be either 'neon' or 'legacy'");
}

const databaseUrl = databaseTarget === "neon"
  ? process.env.NEON_DATABASE_URL
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    `${databaseTarget === "neon" ? "NEON_DATABASE_URL" : "DATABASE_URL"} must be set for CHAT_VAN_DB_TARGET=${databaseTarget}`,
  );
}

function withVerifiedNeonTls(url: string) {
  if (databaseTarget !== "neon") return url;

  const parsed = new URL(url);
  parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    // Drizzle CLIでも接続時の証明書検証を弱めない。
    url: withVerifiedNeonTls(databaseUrl),
  },
});
