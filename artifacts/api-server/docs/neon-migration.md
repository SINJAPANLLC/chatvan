# Chat VAN Neon Migration

## Purpose

`pnpm --filter @workspace/api-server run migrate:neon` transfers the complete PostgreSQL schema and data from `DATABASE_URL` to `NEON_DATABASE_URL`. It validates table content, primary keys, foreign keys, unique constraints, indexes, sequences, the `public` schema, and the `users` and `sessions` tables.

The script does not print database connection strings.

## One-time cutover

1. Confirm both source and Neon secrets are configured.
2. Stop the API service or otherwise stop all writes to the source database.
3. Run the migration with an explicitly confirmed maintenance window:

   ```bash
   CHAT_VAN_MIGRATION_WINDOW=confirmed pnpm --filter @workspace/api-server run migrate:neon -- --restore --replace-target
   ```

4. The script creates a private temporary backup, restores schema and data into Neon, configures the Neon connection role to use `public`, and fails unless validation passes. Both `--restore` and `--replace-target` are always required because the restore recreates target tables.
5. Start the API with the default Neon target. Confirm `/api/healthz` and a read-only application route.

## Validation and rollback

- To validate without changing either database, run `pnpm --filter @workspace/api-server run migrate:neon -- --verify-only`.
- `sessions` may change after cutover as users browse the application. For a post-cutover comparison that intentionally permits only this volatile table to differ, add `--allow-session-drift`.
- The source database is never modified by the script. To roll back an emergency deployment, set `CHAT_VAN_DB_TARGET=legacy` before restarting the API. Normal startup remains fail-closed on `NEON_DATABASE_URL`.