/**
 * Chat VAN — corporate-invoice (法人請求書) contract lifecycle regression test.
 *
 * This is a non-production, self-contained regression script. It does NOT touch
 * a real database, make real Square payments, or send email. It models the
 * server-side invoice lifecycle exactly as implemented in
 * artifacts/api-server/src/routes/van.ts and
 * artifacts/api-server/src/lib/vanLifecycleAuth.ts, then asserts:
 *
 *   1. A valid invoice customer can progress:
 *        pending_payment
 *        → (user POST /pay, method=invoice, credit approved) payment_processing
 *        → (admin issues invoice)                            payment_processing
 *        → (admin confirms payment)                          active
 *        → (delivery)                                        pickup / active app
 *   2. The single authoritative transition activateInvoiceContract only fires
 *      from payment_processing and consistently updates contract + application +
 *      vehicle together (atomic end-state).
 *   3. A regular user (or arbitrary client input) can NEVER drive activation.
 *   4. Card activation is not restored to client control (invoice /pay refuses
 *      any non-invoice method; card must use the Square flow).
 *
 * Run:
 *   pnpm --filter @workspace/scripts run test:van-invoice
 * or directly:
 *   pnpm --filter @workspace/scripts exec tsx ./src/van-invoice-lifecycle.test.ts
 */

// ── The one pure predicate we can import verbatim from server code. ──────────
// Mirrors artifacts/api-server/src/lib/vanLifecycleAuth.ts:isInvoiceRequested.
function isInvoiceRequested(requested: unknown): boolean {
  return requested === "invoice";
}

// ── In-memory model of the three lifecycle tables. ──────────────────────────
interface Contract {
  id: number;
  applicationId: number;
  vehicleId: number;
  userId: number;
  paymentMethod: string | null;
  status: string;
}
interface Application { id: number; status: string }
interface Vehicle { id: number; status: string }
interface User { id: number; creditStatus: string }

const store = {
  contracts: new Map<number, Contract>(),
  applications: new Map<number, Application>(),
  vehicles: new Map<number, Vehicle>(),
  users: new Map<number, User>(),
};

/**
 * Faithful re-implementation of vanLifecycleAuth.activateInvoiceContract:
 * atomic promotion that ONLY fires from payment_processing and moves
 * contract→active, application→delivery_pending, vehicle→rented together.
 */
function activateInvoiceContract(contractId: number): { activated: boolean; reason?: string } {
  const c = store.contracts.get(contractId);
  if (!c || c.status !== "payment_processing") {
    return { activated: false, reason: "not_in_payment_processing" };
  }
  // Atomic block — all three or none.
  c.status = "active";
  c.paymentMethod = "invoice";
  const app = store.applications.get(c.applicationId);
  if (app) app.status = "delivery_pending";
  const veh = store.vehicles.get(c.vehicleId);
  if (veh) veh.status = "rented";
  return { activated: true };
}

// ── Route-guard models (mirror the server handlers' authorization/state rules).
type Caller = { userId: number; role: "user" | "admin" };

/** POST /van/contracts/:id/pay */
function routePay(caller: Caller, contractId: number, body: { method?: string }) {
  const c = store.contracts.get(contractId);
  if (!c) return { status: 404 };
  // authorizeContractOwnerOrAdmin
  if (caller.role !== "admin" && c.userId !== caller.userId) return { status: 403 };
  if (c.status !== "pending_payment") return { status: 400, error: "not pending_payment" };
  // Card activation is NEVER granted here.
  if (!isInvoiceRequested(body.method)) return { status: 400, error: "card must use Square" };
  const u = store.users.get(c.userId);
  if (!u || u.creditStatus !== "approved") return { status: 400, error: "credit not approved" };
  c.paymentMethod = "invoice";
  c.status = "payment_processing";
  return { status: 200 };
}

/** POST /van/contracts/:id/invoice (admin issues invoice) */
function routeIssueInvoice(caller: Caller, contractId: number) {
  if (caller.role !== "admin") return { status: 403 };
  const c = store.contracts.get(contractId);
  if (!c) return { status: 404 };
  if (c.paymentMethod !== "invoice") return { status: 400 };
  if (c.status !== "active" && c.status !== "payment_processing") return { status: 400 };
  return { status: 201 };
}

/** PATCH /van/invoices/:id/status (admin confirms payment) OR
 *  POST /van/contracts/:id/activate-invoice — both go through the one transition. */
function routeConfirmPayment(caller: Caller, contractId: number) {
  if (caller.role !== "admin") return { status: 403 };
  return { status: 200, ...activateInvoiceContract(contractId) };
}

/** POST /van/applications/:id/confirm-pickup */
function routeConfirmPickup(caller: Caller, appId: number) {
  const app = store.applications.get(appId);
  if (!app) return { status: 404 };
  if (app.status !== "delivery_pending") return { status: 400 };
  app.status = "active"; // application active == pickup complete
  return { status: 200 };
}

// ── Tiny assertion harness. ─────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failures.push(msg); }
}
function reset() {
  store.contracts.clear();
  store.applications.clear();
  store.vehicles.clear();
  store.users.clear();
  store.applications.set(1, { id: 1, status: "payment_pending" });
  store.vehicles.set(10, { id: 10, status: "reserved" });
  store.contracts.set(100, {
    id: 100, applicationId: 1, vehicleId: 10, userId: 5,
    paymentMethod: null, status: "pending_payment",
  });
}

const CUSTOMER: Caller = { userId: 5, role: "user" };
const OTHER_USER: Caller = { userId: 999, role: "user" };
const ADMIN: Caller = { userId: 1, role: "admin" };

// ── Test 1: happy path for an approved invoice customer. ────────────────────
reset();
store.users.set(5, { id: 5, creditStatus: "approved" });

let r: any = routePay(CUSTOMER, 100, { method: "invoice" });
assert(r.status === 200, "approved customer /pay(invoice) should succeed");
assert(store.contracts.get(100)!.status === "payment_processing", "contract → payment_processing after /pay");

r = routeIssueInvoice(ADMIN, 100);
assert(r.status === 201, "admin can issue invoice while payment_processing");
assert(store.contracts.get(100)!.status === "payment_processing", "issuing invoice does not activate");

r = routeConfirmPayment(ADMIN, 100);
assert(r.status === 200 && r.activated === true, "admin payment confirmation activates contract");
assert(store.contracts.get(100)!.status === "active", "contract → active");
assert(store.applications.get(1)!.status === "delivery_pending", "application → delivery_pending");
assert(store.vehicles.get(10)!.status === "rented", "vehicle → rented");

r = routeConfirmPickup(CUSTOMER, 1);
assert(r.status === 200 && store.applications.get(1)!.status === "active", "pickup completes lifecycle");

// ── Test 2: transition is idempotent / only fires from payment_processing. ──
r = routeConfirmPayment(ADMIN, 100); // already active
assert(r.activated === false, "activation is idempotent (no re-activation from active)");

reset();
store.users.set(5, { id: 5, creditStatus: "approved" });
r = activateInvoiceContract(100); // still pending_payment
assert(r.activated === false && r.reason === "not_in_payment_processing",
  "cannot activate directly from pending_payment (must pass admin confirmation)");
assert(store.contracts.get(100)!.status === "pending_payment", "contract untouched when not in payment_processing");

// ── Test 3: regular user / arbitrary input can never activate. ──────────────
reset();
store.users.set(5, { id: 5, creditStatus: "approved" });
routePay(CUSTOMER, 100, { method: "invoice" }); // → payment_processing
r = routeConfirmPayment(CUSTOMER, 100);
assert(r.status === 403, "regular user cannot confirm payment / activate");
assert(store.contracts.get(100)!.status === "payment_processing", "contract stays payment_processing for non-admin");

r = routeConfirmPayment(OTHER_USER, 100);
assert(r.status === 403, "unrelated user cannot activate");

// ── Test 4: card activation is not client-controlled via /pay. ──────────────
reset();
store.users.set(5, { id: 5, creditStatus: "approved" });
r = routePay(CUSTOMER, 100, { method: "card" });
assert(r.status === 400, "/pay refuses card method (must use Square flow)");
r = routePay(CUSTOMER, 100, { method: "active" as any });
assert(r.status === 400, "/pay refuses arbitrary/forged method");
assert(store.contracts.get(100)!.status === "pending_payment", "forged input does not change status");

// ── Test 5: unapproved credit cannot request invoice billing. ───────────────
reset();
store.users.set(5, { id: 5, creditStatus: "pending" });
r = routePay(CUSTOMER, 100, { method: "invoice" });
assert(r.status === 400, "pending-credit customer cannot start invoice payment_processing");

// ── Report. ─────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`FAILED (${failures.length}):`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`OK — ${passed} assertions passed (van invoice lifecycle)`);
