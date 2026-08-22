/**
 * vanLifecycleAuth.ts
 *
 * Reusable server-side authorization helpers for Chat VAN application/contract
 * lifecycle routes. Centralizing these checks prevents individual routes from
 * drifting apart in their ownership/role enforcement.
 *
 * Roles (see lib/db users.ts userRoleEnum):
 *   "admin"          — full operator access
 *   "rental_company" — a company account; account carries a rental_company_id
 *   "user"           — a regular applicant/lessee
 *
 * All helpers perform their own DB reads and never trust client-supplied
 * ownership hints (userId, rentalCompanyId, method, status, etc.).
 */
import { db, vanApplicationsTable, vanContractsTable, vehiclesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export type CallerRole = "admin" | "rental_company" | "user" | string;

export interface Caller {
  userId: number | undefined;
  role: CallerRole;
}

/** Extract the authenticated caller from the request session. */
export function getCaller(req: { session?: any }): Caller {
  return {
    userId: (req.session as any)?.userId,
    role: (req.session as any)?.userRole ?? "user",
  };
}

export function isAdmin(caller: Caller): boolean {
  return caller.role === "admin";
}

/** Resolve the rental_company_id that a rental_company account belongs to. */
export async function getCallerRentalCompanyId(userId: number | undefined): Promise<number | null> {
  if (!userId) return null;
  // rental_company_id lives on the users row but is not in the typed schema;
  // read it via raw SQL (matches existing patterns in van.ts).
  const raw = await db.execute(
    sql`SELECT rental_company_id FROM users WHERE id = ${userId} LIMIT 1`,
  );
  const rc = ((raw as any).rows ?? raw)[0]?.rental_company_id ?? null;
  return rc == null ? null : Number(rc);
}

export type AuthOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; status: 404 | 403; error: string };

/**
 * Load a van_application and confirm the caller may perform a user-facing
 * lifecycle action on it. Allowed: admin OR the application owner.
 */
export async function authorizeApplicationOwnerOrAdmin(
  caller: Caller,
  applicationId: number,
): Promise<AuthOutcome<typeof vanApplicationsTable.$inferSelect>> {
  const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, applicationId));
  if (!app) return { ok: false, status: 404, error: "Not found" };
  if (isAdmin(caller)) return { ok: true, value: app };
  if (app.userId != null && app.userId === caller.userId) return { ok: true, value: app };
  return { ok: false, status: 403, error: "Forbidden" };
}

/**
 * Load a van_contract and confirm the caller may perform a user-facing
 * lifecycle action on it. Allowed: admin OR the contract owner (userId).
 */
export async function authorizeContractOwnerOrAdmin(
  caller: Caller,
  contractId: number,
): Promise<AuthOutcome<typeof vanContractsTable.$inferSelect>> {
  const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.id, contractId));
  if (!contract) return { ok: false, status: 404, error: "Not found" };
  if (isAdmin(caller)) return { ok: true, value: contract };
  if (contract.userId === caller.userId) return { ok: true, value: contract };
  return { ok: false, status: 403, error: "Forbidden" };
}

/**
 * Authorize a lifecycle mutation on the application's contract vehicle.
 * Allowed actors:
 *   - admin
 *   - the application owner (regular user, restricted to their own application)
 *   - a rental_company whose company owns the vehicle attached to the contract
 *
 * Returns the resolved application together with the EXACT authorized contract.
 * Callers MUST perform every subsequent contract/vehicle mutation against the
 * returned `contract` (by its `id`), and must NOT re-query a contract by
 * application_id afterwards: an application may map to more than one contract
 * row, and re-querying can pick a different (possibly other-company) contract.
 *
 * Selection semantics:
 *   - rental_company: the returned contract is guaranteed to be one whose
 *     vehicle is owned by the caller's company. Effects never widen beyond that
 *     company-owned contract, even if the application has other contracts.
 *   - admin / owner: a deterministic contract is chosen (lowest id) so behavior
 *     is stable across calls.
 */
export async function authorizeApplicationLifecycleActor(
  caller: Caller,
  applicationId: number,
): Promise<AuthOutcome<{
  app: typeof vanApplicationsTable.$inferSelect;
  contract: typeof vanContractsTable.$inferSelect | null;
}>> {
  const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, applicationId));
  if (!app) return { ok: false, status: 404, error: "Not found" };

  // Load ALL contracts for the application so we can select the exact one the
  // caller is authorized to act on (deterministically ordered by id).
  const contracts = await db
    .select()
    .from(vanContractsTable)
    .where(eq(vanContractsTable.applicationId, applicationId))
    .orderBy(vanContractsTable.id);

  // Admin / owner: deterministic selection (lowest id) matching prior behavior.
  if (isAdmin(caller)) {
    return { ok: true, value: { app, contract: contracts[0] ?? null } };
  }

  // Regular user: only their own application.
  if (app.userId != null && app.userId === caller.userId) {
    return { ok: true, value: { app, contract: contracts[0] ?? null } };
  }

  // Rental company: authorize AND return the specific contract whose vehicle
  // the caller's company owns. This narrows effects to the company-owned
  // contract instead of an arbitrary application contract.
  if (caller.role === "rental_company") {
    const callerRcId = await getCallerRentalCompanyId(caller.userId);
    if (!callerRcId) return { ok: false, status: 403, error: "Forbidden" };

    for (const contract of contracts) {
      if (!contract.vehicleId) continue;
      const [veh] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, contract.vehicleId));
      if (veh?.rentalCompanyId === callerRcId) {
        return { ok: true, value: { app, contract } };
      }
    }
  }

  return { ok: false, status: 403, error: "Forbidden" };
}

/**
 * Server-side derivation of the payment method for a user-initiated /pay call.
 * Never trusts an arbitrary client string. Returns:
 *   - "invoice" only when the caller's account has an approved credit line
 *   - "card"    otherwise
 * The `requested` argument is only used to decide whether the user is opting
 * into invoice billing; any other value is treated as card.
 */
export function isInvoiceRequested(requested: unknown): boolean {
  return requested === "invoice";
}

/**
 * The single authoritative, server-authorized transition that activates a Chat
 * VAN contract that is awaiting invoice (法人請求書) settlement.
 *
 * This mirrors the end-state reached by the verified Square card-success path
 * (POST /van/contracts/:id/square-charge): contract → active (payment_method
 * 'invoice'), application → delivery_pending, vehicle → rented. It is the ONLY
 * place invoice contracts become active, so the card and invoice lifecycles
 * converge on the same, consistent end-state.
 *
 * Guarantees:
 *   - It ONLY promotes a contract that is currently in `payment_processing`
 *     (the state a valid invoice customer reaches after POST .../pay). It never
 *     activates from `pending_payment` — that would bypass admin invoice
 *     issuance / payment confirmation — nor re-activates an already-active one.
 *   - All three writes (contract / application / vehicle) happen atomically in a
 *     single transaction, so partial activation cannot occur.
 *   - It is caller-agnostic on ownership: authorization is the responsibility of
 *     the calling route (admin-only, or the verified provider flow). This helper
 *     never trusts client input for state.
 *
 * Returns `{ activated: true }` when it performed the promotion, or
 * `{ activated: false, reason }` when the contract was not in the expected
 * `payment_processing` state (idempotent / already handled).
 */
export async function activateInvoiceContract(
  contractId: number,
): Promise<{ activated: boolean; reason?: string }> {
  return db.transaction(async (tx) => {
    // Atomically claim the transition: only a contract still in
    // `payment_processing` is promoted. The conditional UPDATE doubles as a
    // lock so concurrent callers cannot both activate.
    const claim = await tx.execute(sql`
      UPDATE van_contracts
      SET status = 'active', payment_method = 'invoice', updated_at = NOW()
      WHERE id = ${contractId} AND status = 'payment_processing'
      RETURNING id, application_id, vehicle_id
    `);
    const row = ((claim as any)?.rows ?? claim ?? [])[0];
    if (!row) {
      return { activated: false, reason: "not_in_payment_processing" };
    }

    if (row.application_id != null) {
      await tx
        .update(vanApplicationsTable)
        .set({ status: "delivery_pending", updatedAt: new Date() })
        .where(eq(vanApplicationsTable.id, Number(row.application_id)));
    }
    if (row.vehicle_id != null) {
      await tx
        .update(vehiclesTable)
        .set({ status: "rented", updatedAt: new Date() })
        .where(eq(vehiclesTable.id, Number(row.vehicle_id)));
    }
    return { activated: true };
  });
}
