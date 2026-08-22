import { Router, type IRouter } from "express";
import { db, paymentsTable, shipmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// Explicit allow-list of client-supplyable payment methods.
// Anything outside this enum is rejected at the validation boundary.
const PAYMENT_METHODS = ["クレジットカード", "請求書"] as const;

// Upper bound for a single payment amount (JPY). Guards against overflow /
// nonsense values while remaining well above any legitimate shipment total.
const MAX_PAYMENT_AMOUNT = 100_000_000; // 1億円

// Internal validation schema aligned with paymentsTable columns.
// NOTE: paymentStatus / paidAt are intentionally excluded — callers can never
// set payment completion state directly. It is derived server-side and is
// authoritative only when written by the verified Square provider flow
// (see routes/square.ts) or by an admin performing manual bookkeeping.
const CreatePaymentInput = z.object({
  shipmentId: z.number().int().positive(),
  amount: z
    .number()
    .finite()
    .positive()
    .max(MAX_PAYMENT_AMOUNT),
  paymentMethod: z.enum(PAYMENT_METHODS),
});

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function formatPayment(p: any) {
  return {
    ...p,
    amount: Number(p.amount),
    tax: Number(p.tax),
    totalAmount: Number(p.totalAmount),
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : p.paidAt,
  };
}

/**
 * GET /payments
 *
 * Admins: may list all payments, or filter by any ?shipmentId=
 * Regular users: MUST supply ?shipmentId= for a shipment they own;
 *   a bare listing with no filter is forbidden for non-admins.
 *   Arbitrary userId filters are silently ignored for non-admins.
 */
router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  const isAdmin = req.session.userRole === "admin";
  const rawShipmentId = req.query.shipmentId ? Number(req.query.shipmentId) : null;

  if (!isAdmin) {
    // Regular users must scope to a specific shipment
    if (!rawShipmentId || isNaN(rawShipmentId)) {
      res.status(403).json({ error: "shipmentIdの指定が必要です" });
      return;
    }

    // Verify the caller owns that shipment
    const [shipment] = await db
      .select({ id: shipmentsTable.id, userId: shipmentsTable.userId })
      .from(shipmentsTable)
      .where(eq(shipmentsTable.id, rawShipmentId))
      .limit(1);

    if (!shipment) {
      res.status(404).json({ error: "案件が見つかりません" });
      return;
    }
    if (shipment.userId !== req.session.userId) {
      res.status(403).json({ error: "アクセス権限がありません" });
      return;
    }

    const payments = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.shipmentId, rawShipmentId));
    res.json(payments.map(formatPayment));
    return;
  }

  // Admin path: optional shipmentId filter is accepted as-is
  if (rawShipmentId && !isNaN(rawShipmentId)) {
    const payments = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.shipmentId, rawShipmentId));
    res.json(payments.map(formatPayment));
  } else {
    const payments = await db.select().from(paymentsTable);
    res.json(payments.map(formatPayment));
  }
});

/**
 * POST /payments
 *
 * This endpoint records a payment row. It NEVER completes a payment based on
 * client input. Authoritative "paid" transitions are owned exclusively by the
 * verified Square provider flow (routes/square.ts: /square/charge and
 * /square/capture, which write 決済完了 / 請求完了 only after a real provider
 * transaction) and by admins performing manual bookkeeping.
 *
 * Regular users:
 *   - May only INITIATE a pending payment request for a shipment they own,
 *     and only when the shipment is in a billable state.
 *   - The created payment is always 未決済 (unpaid); paidAt is never set.
 *   - The shipment status/paymentStatus is NOT advanced to 請求完了 / 決済完了.
 *     Completion happens later through the Square provider flow.
 *
 * Admins:
 *   - Perform manual bookkeeping. May record a payment for any shipment.
 *   - The recorded paymentStatus is derived server-side from paymentMethod
 *     (クレジットカード → 決済完了, 請求書 → 請求書発行済み) and the shipment is
 *     advanced to 請求完了, preserving existing admin behavior.
 */
const USER_BILLABLE_STATUSES = [
  "見積提示",
  "顧客承認",
  "手配中",
  "配車確定",
  "集荷完了",
  "配送中",
  "納品完了",
] as const;

router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePaymentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { shipmentId, amount, paymentMethod } = parsed.data;
  const isAdmin = req.session.userRole === "admin";

  // Look up the shipment first (needed for both auth and later update)
  const [shipment] = await db
    .select({ id: shipmentsTable.id, userId: shipmentsTable.userId, status: shipmentsTable.status })
    .from(shipmentsTable)
    .where(eq(shipmentsTable.id, shipmentId))
    .limit(1);

  if (!shipment) {
    res.status(404).json({ error: "案件が見つかりません" });
    return;
  }

  if (!isAdmin) {
    // Ownership check
    if (shipment.userId !== req.session.userId) {
      res.status(403).json({ error: "アクセス権限がありません" });
      return;
    }
    // Business-flow check: only billable statuses
    if (!(USER_BILLABLE_STATUSES as readonly string[]).includes(shipment.status)) {
      res.status(400).json({ error: "このステータスでは決済を登録できません" });
      return;
    }
  }

  const tax = Math.round(amount * 0.1);
  const totalAmount = amount + tax;

  // paymentStatus / paidAt are derived server-side and can NEVER be forged by
  // the client. Non-admins can only create a pending (未決済) request; the
  // authoritative "paid" transition is performed later by the verified Square
  // provider flow. Admins record completion as part of manual bookkeeping.
  const paymentStatus = isAdmin
    ? paymentMethod === "クレジットカード"
      ? "決済完了"
      : "請求書発行済み"
    : "未決済";
  const paidAt = isAdmin && paymentMethod === "クレジットカード" ? new Date() : null;

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      shipmentId,
      amount: amount.toString(),
      tax: tax.toString(),
      totalAmount: totalAmount.toString(),
      paymentMethod,
      paymentStatus,
      paidAt,
    })
    .returning();

  // Only admin bookkeeping advances the shipment to 請求完了. Non-admin
  // "initiate" requests must NOT transition shipment/payment to a paid/complete
  // state — that is reserved for the verified Square provider flow.
  if (isAdmin) {
    await db
      .update(shipmentsTable)
      .set({
        paymentStatus: paymentStatus as any,
        status: "請求完了",
        updatedAt: new Date(),
      })
      .where(eq(shipmentsTable.id, shipmentId));
  }

  res.status(201).json(formatPayment(payment));
});

/**
 * GET /payments/:id
 *
 * Admins: may view any payment.
 * Regular users: may view a payment only if they own the associated shipment.
 */
router.get("/payments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, id))
    .limit(1);
  if (!payment) { res.status(404).json({ error: "決済情報が見つかりません" }); return; }

  const isAdmin = req.session.userRole === "admin";
  if (!isAdmin) {
    // Verify ownership of the associated shipment
    const [shipment] = await db
      .select({ userId: shipmentsTable.userId })
      .from(shipmentsTable)
      .where(eq(shipmentsTable.id, payment.shipmentId))
      .limit(1);

    if (!shipment || shipment.userId !== req.session.userId) {
      res.status(403).json({ error: "アクセス権限がありません" });
      return;
    }
  }

  res.json(formatPayment(payment));
});

export default router;
