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

/**
 * 配車確定後・集荷前に、登録済みカードを1円で確認してから実額を本決済する。
 *
 * 1円の確認決済は必ず直後にVoidする。実額は別の決済としてautocompleteで
 * 完了させるため、少額のオーソリを本決済として取り違えない。
 */
export async function chargeOnFileBeforePickup(
  shipmentId: number,
): Promise<{ paymentId: string } | { error: string } | { alreadyPaid: true; paymentId: string }> {
  const cfgErr = getSquareConfigError();
  if (cfgErr) return { error: cfgErr };

  const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, shipmentId)).limit(1);
  if (!shipment) return { error: "案件が見つかりません" };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, shipment.userId!)).limit(1);
  if (!user?.squareCardId || !user.squareCustomerId) return { error: "カードが登録されていません" };

  const amountYen = Math.round(Number(shipment.customerPrice) * 1.1);
  if (amountYen <= 0) return { error: "請求金額が設定されていません" };

  // 旧フローで残った実額オーソリは、状態を確認して解放する。本決済済みなら
  // その決済を尊重して二重請求しない。
  if (shipment.squarePaymentId) {
    const existingRes = await squareFetch(`/v2/payments/${shipment.squarePaymentId}`, "GET");
    const existingData = await existingRes.json() as any;
    if (!existingRes.ok) return { error: "既存の決済状態を確認できません。管理者へ確認を依頼してください。" };

    const existingStatus = existingData.payment?.status;
    if (existingStatus === "COMPLETED") {
      await db.update(shipmentsTable).set({
        squareCaptured: "true",
        paymentMethod: "card",
        paymentStatus: "決済完了",
        updatedAt: new Date(),
      }).where(eq(shipmentsTable.id, shipmentId));
      return { alreadyPaid: true, paymentId: shipment.squarePaymentId };
    }
    if (existingStatus === "APPROVED") {
      const cancelRes = await squareFetch(`/v2/payments/${shipment.squarePaymentId}/cancel`, "POST", {});
      if (!cancelRes.ok) return { error: "以前の事前承認を解放できません。管理者へ確認を依頼してください。" };
    } else if (!["CANCELED", "FAILED"].includes(existingStatus)) {
      return { error: "既存の決済が処理中です。管理者へ確認を依頼してください。" };
    }
  }

  // カード有効性の確認は1円だけをオーソリし、必ず直後に解放する。
  const verificationRes = await squareFetch("/v2/payments", "POST", {
    source_id: user.squareCardId,
    idempotency_key: randomUUID(),
    amount_money: { amount: 1, currency: "JPY" },
    customer_id: user.squareCustomerId,
    location_id: process.env.SQUARE_LOCATION_ID,
    autocomplete: false,
    note: `Chat VAN カード確認 案件 #${shipment.id}`,
  });
  const verificationData = await verificationRes.json() as any;
  if (!verificationRes.ok) return { error: `カード確認に失敗しました: ${JSON.stringify(verificationData.errors)}` };

  const verificationId = verificationData.payment?.id;
  if (!verificationId) return { error: "カード確認の決済IDを取得できませんでした" };
  const voidRes = await squareFetch(`/v2/payments/${verificationId}/cancel`, "POST", {});
  if (!voidRes.ok) {
    // 解放できなかった1円オーソリは次回実行時に先に解放を試みる。IDを残さず
    // 新しい確認決済を始めると、少額オーソリが追跡不能になるため禁止する。
    await db.update(shipmentsTable).set({
      squarePaymentId: verificationId,
      squareCaptured: "void_pending",
      paymentStatus: "未決済",
      updatedAt: new Date(),
    }).where(eq(shipmentsTable.id, shipmentId));
    return { error: "カード確認の事前承認を解放できませんでした。管理者へ確認を依頼してください。" };
  }

  // 本決済は受け取り前に完了させる。キーを案件単位で固定し、同時実行でも
  // Square側で一度しか請求されないようにする。
  const chargeRes = await squareFetch("/v2/payments", "POST", {
    source_id: user.squareCardId,
    idempotency_key: `shipment-pre-pickup-${shipment.id}`,
    amount_money: { amount: amountYen, currency: "JPY" },
    customer_id: user.squareCustomerId,
    location_id: process.env.SQUARE_LOCATION_ID,
    autocomplete: true,
    note: `Chat VAN 受け取り前決済 案件 #${shipment.id}`,
  });
  const chargeData = await chargeRes.json() as any;
  if (!chargeRes.ok) return { error: `Square 決済エラー: ${JSON.stringify(chargeData.errors)}` };

  const paymentId = chargeData.payment?.id;
  if (!paymentId) return { error: "決済IDを取得できませんでした" };
  await db.update(shipmentsTable).set({
    squarePaymentId: paymentId,
    squareCaptured: "true",
    paymentMethod: "card",
    paymentStatus: "決済完了",
    updatedAt: new Date(),
  }).where(eq(shipmentsTable.id, shipmentId));

  return { paymentId };
}

// 既存の管理画面・内部呼び出しとの互換用。意味は「受け取り前の本決済」へ変更済み。
export const authorizeOnFile = chargeOnFileBeforePickup;
