import { Router, type IRouter } from "express";
import { db, paymentsTable, shipmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreatePaymentBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

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

router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  const shipmentId = req.query.shipmentId ? Number(req.query.shipmentId) : null;

  let payments;
  if (shipmentId) {
    payments = await db.select().from(paymentsTable).where(eq(paymentsTable.shipmentId, shipmentId));
  } else {
    payments = await db.select().from(paymentsTable);
  }
  res.json(payments.map(formatPayment));
});

router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { shipmentId, amount, paymentMethod } = parsed.data;
  const tax = Math.round(amount * 0.1);
  const totalAmount = amount + tax;

  // For test payment, mark as complete immediately
  const paymentStatus = paymentMethod === "クレジットカード" ? "決済完了" : "請求書発行済み";
  const paidAt = paymentMethod === "クレジットカード" ? new Date() : null;

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

  // Update shipment payment status
  await db
    .update(shipmentsTable)
    .set({
      paymentStatus: paymentStatus as any,
      status: "請求完了",
      updatedAt: new Date(),
    })
    .where(eq(shipmentsTable.id, shipmentId));

  res.status(201).json(formatPayment(payment));
});

router.get("/payments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id)).limit(1);
  if (!payment) { res.status(404).json({ error: "決済情報が見つかりません" }); return; }
  res.json(formatPayment(payment));
});

export default router;
