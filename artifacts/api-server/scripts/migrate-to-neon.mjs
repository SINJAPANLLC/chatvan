import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const shouldRestore = args.has("--restore");
const shouldReplaceTarget = args.has("--replace-target");
const allowSessionDrift = args.has("--allow-session-drift");

if ([...args].some((arg) => ![
  "--restore",
  "--replace-target",
  "--allow-session-drift",
  "--verify-only",
].includes(arg))) {
  throw new Error("Unsupported option. Use --verify-only, --restore, --replace-target, or --allow-session-drift.");
}

if (shouldRestore && process.env.CHAT_VAN_MIGRATION_WINDOW !== "confirmed") {
  throw new Error("Set CHAT_VAN_MIGRATION_WINDOW=confirmed after stopping API writes before restoring.");
}

if (shouldRestore && !shouldReplaceTarget) {
  throw new Error("--restore always requires --replace-target because it recreates Neon tables.");
}

if (shouldReplaceTarget && !shouldRestore) {
  throw new Error("--replace-target can only be used with --restore.");
}

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.NEON_DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  throw new Error("DATABASE_URL and NEON_DATABASE_URL must both be configured.");
}

function needsSsl(connectionString) {
  return connectionString.includes("neon.tech") ||
    connectionString.includes("supabase.co") ||
    connectionString.includes("amazonaws.com") ||
    connectionString.includes("sslmode=require");
}

function createClient(connectionString) {
  return new pg.Client({
    connectionString,
    ...(needsSsl(connectionString) ? { ssl: { rejectUnauthorized: true } } : {}),
  });
}

function withVerifiedTls(connectionString) {
  if (!needsSsl(connectionString)) return connectionString;
  const parsed = new URL(connectionString);
  parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function tableSnapshot(connectionString) {
  const client = createClient(connectionString);
  await client.connect();
  try {
    const tableNames = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tables = {};
    for (const { table_name: table } of tableNames.rows) {
      const result = await client.query(`
        SELECT
          count(*)::text AS row_count,
          md5(coalesce(string_agg(to_jsonb(row_data)::text, '' ORDER BY to_jsonb(row_data)::text), '')) AS content_hash
        FROM "public".${quoteIdentifier(table)} AS row_data
      `);
      tables[table] = result.rows[0];
    }

    const integrity = await client.query(`
      SELECT
        (SELECT count(*)::int FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f') AS foreign_keys,
        (SELECT count(*)::int FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f' AND NOT convalidated) AS unvalidated_foreign_keys,
        (SELECT count(*)::int FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'p') AS primary_keys,
        (SELECT count(*)::int FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'u') AS unique_constraints,
        (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public') AS indexes,
        (SELECT count(*)::int FROM pg_sequences WHERE schemaname = 'public') AS sequences
    `);
    return { tables, integrity: integrity.rows[0] };
  } finally {
    await client.end();
  }
}

function compareSnapshots(source, target) {
  const tableNames = [...new Set([...Object.keys(source.tables), ...Object.keys(target.tables)])].sort();
  const mismatches = tableNames.filter((table) => {
    if (allowSessionDrift && table === "sessions") return false;
    const sourceTable = source.tables[table];
    const targetTable = target.tables[table];
    return !sourceTable ||
      !targetTable ||
      sourceTable.row_count !== targetTable.row_count ||
      sourceTable.content_hash !== targetTable.content_hash;
  });
  const integrityFields = ["foreign_keys", "primary_keys", "unique_constraints", "indexes", "sequences"];
  const integrityMatches = integrityFields.every(
    (field) => source.integrity[field] === target.integrity[field],
  ) && target.integrity.unvalidated_foreign_keys === 0;

  return { tableNames, mismatches, integrityMatches };
}

async function configureNeonSearchPath() {
  const client = createClient(targetUrl);
  await client.connect();
  try {
    const { rows } = await client.query("SELECT current_user AS role_name");
    const role = rows[0]?.role_name;
    if (!role) throw new Error("Unable to determine the Neon connection role.");
    await client.query(`ALTER ROLE ${quoteIdentifier(role)} SET search_path TO public`);
  } finally {
    await client.end();
  }

  const verification = createClient(targetUrl);
  await verification.connect();
  try {
    const { rows } = await verification.query(`
      SELECT
        current_schema() AS current_schema,
        to_regclass('public.users')::text AS users_table,
        to_regclass('public.sessions')::text AS sessions_table
    `);
    if (
      rows[0]?.current_schema !== "public" ||
      rows[0]?.users_table !== "users" ||
      rows[0]?.sessions_table !== "sessions"
    ) {
      throw new Error("Neon preflight failed: public schema, users table, or sessions table is unavailable.");
    }
  } finally {
    await verification.end();
  }
}

async function verifyNeonPreflight() {
  const client = createClient(targetUrl);
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        current_schema() AS current_schema,
        to_regclass('public.users')::text AS users_table,
        to_regclass('public.sessions')::text AS sessions_table
    `);
    if (
      rows[0]?.current_schema !== "public" ||
      rows[0]?.users_table !== "users" ||
      rows[0]?.sessions_table !== "sessions"
    ) {
      throw new Error("Neon preflight failed: public schema, users table, or sessions table is unavailable.");
    }
  } finally {
    await client.end();
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}.`);
}

async function restoreSourceIntoNeon() {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const dumpPath = join(tmpdir(), `chat-van-neon-${timestamp}.dump`);
  run("pg_dump", [
    `--dbname=${withVerifiedTls(sourceUrl)}`,
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    `--file=${dumpPath}`,
  ]);
  if (!existsSync(dumpPath)) throw new Error("Source backup was not created.");

  const checksum = createHash("sha256").update(await import("node:fs/promises").then(({ readFile }) => readFile(dumpPath))).digest("hex");
  run("pg_restore", [
    `--dbname=${withVerifiedTls(targetUrl)}`,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
    dumpPath,
  ]);
  return { dumpPath, checksum };
}

const beforeSource = await tableSnapshot(sourceUrl);
const beforeTarget = await tableSnapshot(targetUrl);
const beforeComparison = compareSnapshots(beforeSource, beforeTarget);

if (!shouldRestore) {
  await verifyNeonPreflight();
  if (beforeComparison.mismatches.length || !beforeComparison.integrityMatches) {
    throw new Error(
      `Verification failed: ${beforeComparison.mismatches.length} table mismatch(es); use --restore --replace-target during a confirmed maintenance window to replace the target.`,
    );
  }
  console.log(`Verified ${beforeComparison.tableNames.length} tables with matching data and constraints.`);
  process.exit(0);
}

if (
  (beforeComparison.mismatches.length || !beforeComparison.integrityMatches) &&
  !shouldReplaceTarget
) {
  throw new Error("Neon differs from the source. Re-run with --replace-target only after confirming the maintenance window.");
}

const backup = await restoreSourceIntoNeon();
await configureNeonSearchPath();
await verifyNeonPreflight();
const afterSource = await tableSnapshot(sourceUrl);
const afterTarget = await tableSnapshot(targetUrl);
const afterComparison = compareSnapshots(afterSource, afterTarget);
if (afterComparison.mismatches.length || !afterComparison.integrityMatches) {
  throw new Error(`Post-restore validation failed: ${afterComparison.mismatches.length} table mismatch(es).`);
}

console.log(
  `Restored and verified ${afterComparison.tableNames.length} tables. Backup retained temporarily at ${backup.dumpPath}; checksum ${backup.checksum}.`,
);