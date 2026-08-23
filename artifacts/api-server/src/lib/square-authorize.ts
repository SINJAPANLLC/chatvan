import { db, shipmentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT ?? "production";
const SQUARE_BASE =
  SQUARE_ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

/**
 * Returns a description of which Square config values are missing,
 * without revealing actual secret values.
 */
export function getSquareConfigError(): string | null {
  const missing: string[] = [];
  if (!process.env.SQUARE_ACCESS_TOKEN) missing.push("SQUARE_ACCESS_TOKEN");
  if (!process.env.SQUARE_LOCATION_ID) missing.push("SQUARE_LOCATION_ID");
  if (missing.length === 0) return null;
  return `Square設定が不完全です。未設定の環境変数: ${missing.join(", ")}`;
}

export function squareFetch(path: string, method: string, body?: object) {
  return fetch(`${SQUARE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-11-20",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** 登録済みカードでオーソリを実行し squarePaymentId を案件に保存する */
export async function authorizeOnFile(shipmentId: number): Promise<{ paymentId: string } | { error: string } | { alreadyAuthorized: true }> {
  const cfgErr = getSquareConfigError();
  if (cfgErr) return { error: cfgErr };

  const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, shipmentId)).limit(1);
  if (!shipment) return { error: "案件が見つかりません" };
  if (shipment.squarePaymentId) return { alreadyAuthorized: true };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, shipment.userId!)).limit(1);
  if (!user?.squareCardId) return { error: "カードが登録されていません" };

  const amountYen = Math.round(Number(shipment.customerPrice) * 1.1);
  const squareRes = await squareFetch("/v2/payments", "POST", {
    source_id: user.squareCardId,
    idempotency_key: randomUUID(),
    amount_money: { amount: amountYen, currency: "JPY" },
    customer_id: user.squareCustomerId,
    location_id: process.env.SQUARE_LOCATION_ID,
    autocomplete: false,
    note: `Chat VAN 案件 #${shipment.id}`,
  });

  const data = await squareRes.json() as any;
  if (!squareRes.ok) return { error: `Square エラー: ${JSON.stringify(data.errors)}` };

  const paymentId = data.payment?.id;
  await db.update(shipmentsTable).set({
    squarePaymentId: paymentId,
    squareCaptured: "false",
    paymentMethod: "card",
    paymentStatus: "決済処理中",
    updatedAt: new Date(),
  }).where(eq(shipmentsTable.id, shipmentId));

  return { paymentId };
}
