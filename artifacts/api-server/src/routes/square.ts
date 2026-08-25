import { Router, type IRouter } from "express";
import { db, shipmentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { randomUUID } from "crypto";
import { squareFetch, chargeOnFileBeforePickup, getSquareConfigError } from "../lib/square-authorize";

const SQUARE_ERROR_MESSAGES: Record<string, string> = {
  INVALID_CARD_DATA:              "カード情報が無効です。入力内容をご確認ください。",
  PAN_FAILURE:                    "カード番号が正しくありません。入力内容をご確認ください。",
  EXPIRATION_FAILURE:             "有効期限が正しくありません。",
  CVV_FAILURE:                    "セキュリティコード（CVV）が正しくありません。",
  CARD_EXPIRED:                   "カードの有効期限が切れています。",
  INSUFFICIENT_FUNDS:             "残高が不足しています。別のカードをお試しください。",
  TRANSACTION_LIMIT:              "カードの1回あたりの利用限度額を超えています。別のカードをお試しください。",
  GENERIC_DECLINE:                "カードが拒否されました。カード会社にお問い合わせいただくか、別のカードをお試しください。",
  DO_NOT_HONOR:                   "カードが拒否されました。カード会社にお問い合わせください。",
  ADDRESS_VERIFICATION_FAILURE:   "住所の確認に失敗しました。",
  CARD_NOT_SUPPORTED:             "このカードは対応していません。別のカードをお試しください。",
  INVALID_ACCOUNT:                "カード情報が無効です。別のカードをお試しください。",
  INVALID_EXPIRATION:             "有効期限が正しくありません。",
};

function squareErrorMessage(errors: any[]): string {
  const code = errors?.[0]?.code;
  return SQUARE_ERROR_MESSAGES[code] ?? "決済処理中にエラーが発生しました。しばらく待ってから再度お試しください。";
}

const router: IRouter = Router();

// POST /square/register-card — 依頼承認時にカードを顧客として登録（Card on File）
router.post("/square/register-card", requireAuth, async (req, res): Promise<void> => {
  const cfgErr = getSquareConfigError();
  if (cfgErr) { res.status(503).json({ error: cfgErr }); return; }

  const { sourceId } = req.body;
  if (!sourceId) { res.status(400).json({ error: "sourceId は必須です" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
  if (!user) { res.status(404).json({ error: "ユーザーが見つかりません" }); return; }

  // すでにSquare顧客が存在する場合は新しいカードを追加
  let customerId = user.squareCustomerId;

  if (!customerId) {
    // Square Customerを新規作成
    const custRes = await squareFetch("/v2/customers", "POST", {
      idempotency_key: randomUUID(),
      email_address: user.email,
      given_name: user.name,
      company_name: user.companyName ?? undefined,
      phone_number: user.phone ?? undefined,
      reference_id: String(user.id),
    });
    const custData = await custRes.json() as any;
    if (!custRes.ok) {
      console.error("[Square] 顧客作成失敗:", JSON.stringify(custData.errors));
      res.status(502).json({ error: squareErrorMessage(custData.errors) });
      return;
    }
    customerId = custData.customer.id;
  }

  // Card on File を作成
  const cardRes = await squareFetch("/v2/cards", "POST", {
    idempotency_key: randomUUID(),
    source_id: sourceId,
    card: {
      customer_id: customerId,
      cardholder_name: user.name,
    },
  });
  const cardData = await cardRes.json() as any;
  if (!cardRes.ok) {
    console.error("[Square] カード登録失敗 status:", cardRes.status, "errors:", JSON.stringify(cardData.errors));
    res.status(502).json({ error: squareErrorMessage(cardData.errors) });
    return;
  }

  const card = cardData.card;
  // ユーザーにSquare顧客IDとカードIDを保存
  await db.update(usersTable).set({
    squareCustomerId: customerId,
    squareCardId: card.id,
    cardBrand: card.card_brand ?? null,
    cardLast4: card.last_4 ?? null,
    cardExpiry: card.exp_month && card.exp_year ? `${card.exp_month}/${card.exp_year}` : null,
  }).where(eq(usersTable.id, user.id));

  res.json({ customerId, cardId: card.id, brand: card.card_brand, last4: card.last_4 });
});

// POST /square/authorize-on-file/:shipmentId — 互換URL: 1円確認後に受け取り前本決済
router.post("/square/authorize-on-file/:shipmentId", requireAdmin, async (req, res): Promise<void> => {
  const cfgErr = getSquareConfigError();
  if (cfgErr) { res.status(503).json({ error: cfgErr }); return; }

  const shipmentId = Number(req.params.shipmentId);
  if (isNaN(shipmentId)) { res.status(400).json({ error: "無効なID" }); return; }

  const result = await chargeOnFileBeforePickup(shipmentId);
  if ("error" in result) { res.status(400).json(result); return; }
  res.json(result);
});

// POST /square/authorize
// proposal画面：カードトークンで1円オーソリ（カード有効性確認のみ、即void）
router.post("/square/authorize", requireAuth, async (req, res): Promise<void> => {
  const cfgErr = getSquareConfigError();
  if (cfgErr) { res.status(503).json({ error: cfgErr }); return; }

  const { shipmentId, sourceId } = req.body;
  if (!shipmentId || !sourceId) {
    res.status(400).json({ error: "shipmentId と sourceId は必須です" });
    return;
  }

  const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, Number(shipmentId))).limit(1);
  if (!shipment) { res.status(404).json({ error: "案件が見つかりません" }); return; }

  // 管理者または案件の所有者のみ許可
  const isAdmin = req.session.userRole === "admin";
  if (!isAdmin && shipment.userId !== req.session.userId) {
    res.status(403).json({ error: "権限がありません" });
    return;
  }

  // 1円でカード有効性確認（オーソリのみ）
  const squareRes = await squareFetch("/v2/payments", "POST", {
    source_id: sourceId,
    idempotency_key: randomUUID(),
    amount_money: { amount: 1, currency: "JPY" },
    location_id: process.env.SQUARE_LOCATION_ID,
    autocomplete: false,
    note: `Chat VAN カード確認 案件 #${shipment.id}`,
  });

  const data = await squareRes.json() as any;
  if (!squareRes.ok) {
    console.error("[Square] /v2/payments エラー status:", squareRes.status, "errors:", JSON.stringify(data.errors));
    res.status(502).json({ error: squareErrorMessage(data.errors) });
    return;
  }

  const paymentId = data.payment?.id;
  if (!paymentId) {
    res.status(502).json({ error: "カード確認の決済IDを取得できませんでした" });
    return;
  }

  // 1円オーソリは即void（仮押さえを解放）
  const cancelRes = await squareFetch(`/v2/payments/${paymentId}/cancel`, "POST", {});
  const cancelData = await cancelRes.json() as any;
  if (!cancelRes.ok) {
    // 解放できなかったオーソリを追跡可能にし、カード確認済みとして先へ進めない。
    await db.update(shipmentsTable).set({
      squarePaymentId: paymentId,
      squareCaptured: "void_pending",
      paymentStatus: "未決済",
      updatedAt: new Date(),
    }).where(eq(shipmentsTable.id, Number(shipmentId)));
    console.error("[Square] 1円オーソリの解放失敗:", JSON.stringify(cancelData.errors));
    res.status(502).json({ error: "カード確認の事前承認を解放できませんでした。管理者へ確認を依頼してください。" });
    return;
  }

  // カード確認済みをDBに記録
  await db.update(shipmentsTable).set({
    paymentMethod: "card",
    updatedAt: new Date(),
  }).where(eq(shipmentsTable.id, Number(shipmentId)));

  res.json({ status: "card_verified" });
});

// POST /square/charge
// 互換用のpayment画面: 受け取り前に実金額を即時決済する。
router.post("/square/charge", requireAuth, async (req, res): Promise<void> => {
  const cfgErr = getSquareConfigError();
  if (cfgErr) { res.status(503).json({ error: cfgErr }); return; }

  const { shipmentId, sourceId } = req.body;
  if (!shipmentId || !sourceId) {
    res.status(400).json({ error: "shipmentId と sourceId は必須です" });
    return;
  }

  const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, Number(shipmentId))).limit(1);
  if (!shipment) { res.status(404).json({ error: "案件が見つかりません" }); return; }

  // 管理者または案件の所有者のみ許可
  const isAdmin = req.session.userRole === "admin";
  if (!isAdmin && shipment.userId !== req.session.userId) {
    res.status(403).json({ error: "権限がありません" });
    return;
  }

  // 同一案件の完了済み決済は必ず再利用する。古い実額オーソリが残っている
  // 場合も、状態を解決するまで新しい請求を作らない。
  if (shipment.squarePaymentId) {
    const existingRes = await squareFetch(`/v2/payments/${shipment.squarePaymentId}`, "GET");
    const existingData = await existingRes.json() as any;
    if (!existingRes.ok) {
      res.status(409).json({ error: "既存の決済状態を確認できません。管理者へ確認を依頼してください。" });
      return;
    }
    const existingStatus = existingData.payment?.status;
    if (existingStatus === "COMPLETED") {
      await db.update(shipmentsTable).set({
        squareCaptured: "true",
        paymentMethod: "card",
        paymentStatus: "決済完了",
        updatedAt: new Date(),
      }).where(eq(shipmentsTable.id, Number(shipmentId)));
      res.json({ status: "paid", paymentId: shipment.squarePaymentId, alreadyPaid: true });
      return;
    }
    if (!["CANCELED", "FAILED"].includes(existingStatus)) {
      res.status(409).json({ error: "既存の決済またはカード確認が処理中です。管理者へ確認を依頼してください。" });
      return;
    }
  }

  // 税込み請求金額（消費税10%）
  const baseAmount = Number(shipment.customerPrice) || 0;
  const taxAmount = Math.round(baseAmount * 0.1);
  const totalAmount = baseAmount + taxAmount;

  if (totalAmount <= 0) {
    res.status(400).json({ error: "請求金額が設定されていません。管理者に確認してください。" });
    return;
  }

  // 実金額を即時決済（autocomplete: true = オーソリ＋キャプチャ同時）。
  // 受け取り前の登録済みカード決済と同じキーにし、経路をまたぐ再送でも
  // Square側で一度しか請求されないようにする。
  const squareRes = await squareFetch("/v2/payments", "POST", {
    source_id: sourceId,
    idempotency_key: `shipment-pre-pickup-${shipment.id}`,
    amount_money: { amount: totalAmount, currency: "JPY" },
    location_id: process.env.SQUARE_LOCATION_ID,
    autocomplete: true,
    note: `Chat VAN 決済 案件 #${shipment.id}`,
    buyer_email_address: req.session?.userEmail ?? undefined,
  });

  const data = await squareRes.json() as any;
  if (!squareRes.ok) {
    console.error("[Square] /v2/payments エラー status:", squareRes.status, "errors:", JSON.stringify(data.errors));
    res.status(502).json({ error: squareErrorMessage(data.errors) });
    return;
  }

  const paymentId = data.payment?.id;

  // 決済完了をDBに記録
  await db.update(shipmentsTable).set({
    paymentMethod: "card",
    paymentStatus: "決済完了",
    squarePaymentId: paymentId,
    squareCaptured: "true",
    updatedAt: new Date(),
  }).where(eq(shipmentsTable.id, Number(shipmentId)));

  res.json({ status: "paid", paymentId });
});

// POST /square/capture/:paymentId — 廃止済み: 事前承認を納品後にキャプチャしない
router.post("/square/capture/:squarePaymentId", requireAdmin, async (req, res): Promise<void> => {
  res.status(410).json({
    error: "事前承認の後日キャプチャは廃止されました。受け取り前に本決済を完了してください。",
  });
});

// POST /square/cancel/:squarePaymentId — キャンセル
router.post("/square/cancel/:squarePaymentId", requireAdmin, async (req, res): Promise<void> => {
  const cfgErr = getSquareConfigError();
  if (cfgErr) { res.status(503).json({ error: cfgErr }); return; }

  const squarePaymentId = String(req.params.squarePaymentId);

  const squareRes = await squareFetch(`/v2/payments/${squarePaymentId}/cancel`, "POST", {});
  const data = await squareRes.json() as any;

  if (!squareRes.ok) {
    res.status(502).json({ error: "Square キャンセル失敗", detail: data.errors });
    return;
  }

  await db.update(shipmentsTable).set({
    squareCaptured: "cancelled",
    paymentStatus: "未決済",
    updatedAt: new Date(),
  }).where(eq(shipmentsTable.squarePaymentId, squarePaymentId));

  res.json({ ok: true });
});

export default router;
