import { Router, type IRouter } from "express";
import { db, shipmentsTable, conversationsTable, settingsTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { calcPriceWithConfig, parsePricingConfig, DEFAULT_CONFIG } from "../lib/pricing";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

// ── System prompt (DB優先、フォールバックはハードコード) ────────────────────

const DEFAULT_PROMPT = `あなたはChat LOGIの物流AIアシスタントです。日本語で丁寧かつ簡潔に応答してください。

## 今日の日付
今日は {DATE}（{WEEKDAY}曜日）です。「明日」「来週」などはこの日付を基準に計算し、提案では必ず「YYYY-MM-DD HH:MM」形式で出力してください。

---

## 進め方：3フェーズで情報収集 → プラン提案

各フェーズのチェック項目を順番に確認する。1ターンに質問は必ず1つだけ。
ユーザーが最初から複数情報を提供している場合は、済んだ項目をスキップしてOK。

---

### フェーズ1：ルート・日程（4項目）

1. 集荷先の住所（番地まで）
2. 集荷日時（日付と希望時間帯）
3. 納品先の住所（番地まで）
4. 納品希望日時

→ 4項目が揃ったらフェーズ2へ進む。

---

### フェーズ2：荷物情報（2項目）

5. 物量・荷姿（例：パレット10枚、段ボール50箱、機械1台）
6. 付帯作業の有無（手積み・手降ろし・ラッシング・養生・搬入出など）

→ 2項目が揃ったらフェーズ3へ進む。

---

### フェーズ3：条件確認（3項目）→ プラン提案

7. スポット便（単発）か定期便（繰り返し）か
8. 高速道路の利用有無
9. 備考・特記事項（入構証・フロア・時間指定など。「特になし」でもOK）

→ 9番まで揃ったその返答で、必ず <proposal> タグを出力する。いかなる理由があっても出力を省略してはならない。

---

## 選択肢ボタン（必須）
すべての質問で必ず選択肢を出力すること：
<options>["選択肢A", "選択肢B", "選択肢C"]</options>

集荷日の例：<options>["今日（{DATE}）", "明日", "明後日", "来週以降", "日程未定"]</options>
荷姿の例：<options>["パレット", "段ボール箱", "機械・設備", "バラ積み", "その他"]</options>
付帯作業の例：<options>["不要", "手積み・手降ろし", "ラッシング・養生", "搬入・搬出あり", "複数あり"]</options>
スポット/定期の例：<options>["スポット（今回のみ）", "定期（繰り返し利用）"]</options>
高速代の例：<options>["高速あり", "高速なし（一般道のみ）", "どちらでもOK"]</options>
備考の例：<options>["特になし", "時間指定あり", "入構証が必要", "フロア指定あり", "その他あり"]</options>

---

## <proposal> 出力ルール
- フェーズ3の9番まで回答が揃ったら、その返答の末尾に必ず出力する
- 料金・車格はシステムが計算するため、あなたは情報を正確に埋めることだけに集中すること
- vehicleSize は次の中から選ぶ：軽貨物 / 1t / 2t / 4t / 10t / 大型
- vehicleBodyType は次の中から選ぶ：平ボディ / ウイング / バン / 冷凍冷蔵 / 幌
- truckCount は荷物量から推定する（ユーザーには聞かない）
- highwayUse は true / false で出力する
- isUrgent は集荷日が今日（{DATE}）の場合に true とする
- cargoType は荷物の種類を日本語で入力（例：精密機器、食品、家具、建材）
- cargoQuantity は物量・荷姿を日本語で入力（例：パレット10枚、段ボール50箱）
- additionalWork は付帯作業を日本語で（例：手積み・手降ろし、不要）
- deliveryType は「スポット」または「定期」のどちらか

## <proposal> JSONフォーマット（必須・フィールド名は必ずこの通りにすること）
\`\`\`json
{
  "vehicleSize": "2t",
  "vehicleBodyType": "平ボディ",
  "truckCount": 1,
  "pickupAddress": "東京都〇〇区〇〇1-1-1",
  "pickupDatetime": "2026-08-07 10:00",
  "deliveryAddress": "大阪府〇〇市〇〇1-1-1",
  "deliveryDatetime": "2026-08-07 17:00",
  "cargoType": "精密機器",
  "cargoQuantity": "段ボール20箱",
  "additionalWork": "不要",
  "deliveryType": "スポット",
  "highwayUse": true,
  "isUrgent": false,
  "notes": "特になし"
}
\`\`\`
- **フィールド名は上記の通りに固定**（pickupDateTimeやcargo等の別名は使わない）
- pickupDatetime / deliveryDatetime は必ず "YYYY-MM-DD HH:MM" 形式の文字列
- cargoType は荷物の種類（例: パレット、段ボール、機械）
- cargoQuantity は数量・荷姿（例: パレット20枚、段ボール50箱）
- deliveryType は "スポット" または "定期" のどちらか（serviceTypeは使わない）
- highwayUse は true または false（文字列不可）`;

async function buildSystemPrompt(): Promise<string> {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dateStr = jst.toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 9 * 60 * 60 * 1000 + 86400000).toISOString().slice(0, 10);
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const dayOfWeek = dayNames[jst.getUTCDay()];

  let template = DEFAULT_PROMPT;
  let minPrice = DEFAULT_CONFIG.minPrice;
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "ai_system_prompt"));
    if (row?.value) template = row.value;
    const pricingRows = await db.select().from(settingsTable).where(like(settingsTable.key, "pricing_%"));
    if (pricingRows.length > 0) minPrice = parsePricingConfig(pricingRows).minPrice;
  } catch { /* DBエラー時はデフォルトを使用 */ }

  return template
    .replace(/\{DATE\}/g, dateStr)
    .replace(/\{WEEKDAY\}/g, dayOfWeek)
    .replace(/\{TOMORROW\}/g, tomorrow)
    .replace(/\{MIN_PRICE\}/g, `¥${minPrice.toLocaleString()}`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function repairJson(raw: string): string {
  return raw
    .replace(/,\s*([}\]])/g, '$1')       // trailing commas
    .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // unquoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"') // single-quoted values
    .trim();
}

function stripCodeBlock(raw: string): string {
  // ```json ... ``` や ``` ... ``` を除去してJSON部分だけ返す
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function tryParseJson(raw: string): Record<string, any> | null {
  const candidates = [raw, stripCodeBlock(raw), repairJson(raw), repairJson(stripCodeBlock(raw))];
  for (const c of candidates) {
    try { const r = JSON.parse(c); if (r && typeof r === 'object') return r; } catch { /* continue */ }
  }
  return null;
}

function extractProposal(content: string): Record<string, any> | null {
  // 1) <proposal>…</proposal> タグを試みる（Markdownコードブロック含む）
  const tagMatch = content.match(/<proposal>([\s\S]*?)<\/proposal>/);
  if (tagMatch) {
    const result = tryParseJson(tagMatch[1].trim());
    if (result) return result;
  }
  // 2) タグなし：レスポンス全体から最初の {...} ブロックを探す
  const jsonMatch = content.match(/\{[\s\S]*"vehicleSize"[\s\S]*\}/);
  if (jsonMatch) {
    const result = tryParseJson(jsonMatch[0]);
    if (result) return result;
  }
  return null;
}

function extractOptions(content: string): string[] | null {
  const match = content.match(/<options>(\[[\s\S]*?\])<\/options>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

function stripTags(content: string): string {
  return content
    .replace(/<proposal>[\s\S]*?<\/proposal>/g, "")
    .replace(/<options>[\s\S]*?<\/options>/g, "")
    .trim();
}

async function buildMessages(history: { sender: string; message: string }[], newUserMsg?: string) {
  const msgs: { role: "user" | "assistant" | "system"; content: string }[] = [
    { role: "system", content: await buildSystemPrompt() },
  ];
  for (const h of history) {
    msgs.push({ role: h.sender === "user" ? "user" : "assistant", content: h.message });
  }
  if (newUserMsg) msgs.push({ role: "user", content: newUserMsg });
  return msgs;
}

// AIが返すフィールド名のゆらぎを正規化するヘルパー
function normalizeProposal(raw: Record<string, any>): Record<string, any> {
  const p = { ...raw };

  // --- 日時: 文字列 or {from, to} オブジェクト → 文字列に統一 ---
  const toDateStr = (v: any): string | null => {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return v.from ?? v.start ?? v.date ?? null;
    return null;
  };
  // pickupDatetime / pickupDateTime / pickup_datetime など
  p.pickupDatetime = toDateStr(p.pickupDatetime ?? p.pickupDateTime ?? p.pickup_datetime);
  // deliveryDatetime / deliveryDateTime / deliveryDeadline など
  p.deliveryDatetime = toDateStr(p.deliveryDatetime ?? p.deliveryDateTime ?? p.delivery_datetime ?? p.deliveryDeadline);

  // --- 荷物: cargo / cargoInfo → cargoType + cargoQuantity ---
  if (!p.cargoType && !p.cargoQuantity) {
    const combined: string = p.cargo ?? p.cargoInfo ?? p.cargoDetails ?? '';
    if (combined) {
      // "標準パレット20枚（重量不明）" → type=パレット, qty=20枚
      p.cargoType    = combined.replace(/[（(][^）)]*[）)]/g, '').trim() || combined;
      p.cargoQuantity = combined;
    }
  }

  // --- deliveryType: serviceType / service_type など ---
  if (!p.deliveryType) {
    const raw = p.serviceType ?? p.service_type ?? p.type ?? '';
    if (raw.includes('定期')) p.deliveryType = '定期';
    else if (raw) p.deliveryType = 'スポット';
  }

  // --- additionalWork: "なし"/"不要"/"none" → null ---
  const aw = p.additionalWork ?? p.additional_work ?? p.additionalWorks ?? '';
  if (/^(なし|不要|none|no|-)$/i.test(String(aw).trim())) p.additionalWork = '不要';
  else if (aw) p.additionalWork = aw;

  // --- highwayUse: 文字列 "true"/"あり" → boolean ---
  const hw = p.highwayUse ?? p.highway_use ?? p.highway;
  p.highwayUse = hw === true || hw === 'true' || hw === 'あり' || hw === 'yes';

  return p;
}

// Apply proposal data to a DB update object, calculating price via the engine
async function proposalToDbUpdate(rawProposal: Record<string, any>) {
  const proposal = normalizeProposal(rawProposal);

  const truckCount = Number(proposal.truckCount) || 1;
  const highwayUse = proposal.highwayUse === true;

  // DB から料金設定を読み込み（失敗時はデフォルト）
  let pricingCfg = DEFAULT_CONFIG;
  try {
    const rows = await db.select().from(settingsTable).where(like(settingsTable.key, "pricing_%"));
    if (rows.length > 0) pricingCfg = parsePricingConfig(rows);
  } catch { /* デフォルト設定を使用 */ }

  const pricing = calcPriceWithConfig({
    vehicleSize: proposal.vehicleSize ?? '2t',
    vehicleBodyType: proposal.vehicleBodyType ?? '平ボディ',
    truckCount,
    pickupAddress: proposal.pickupAddress,
    deliveryAddress: proposal.deliveryAddress,
    deliveryType: proposal.deliveryType,
    additionalWork: proposal.additionalWork,
    highwayUse,
    isUrgent: proposal.isUrgent ?? false,
  }, pricingCfg);

  const vehicleType = `${proposal.vehicleSize ?? ''}${proposal.vehicleBodyType ?? ''}`.trim() || proposal.vehicleType;

  return {
    status: "見積提示" as const,
    vehicleType,
    vehicleSize:      proposal.vehicleSize      ?? null,
    vehicleBodyType:  proposal.vehicleBodyType  ?? null,
    truckCount,
    deliveryType:     proposal.deliveryType     ?? null,
    deliveryMethod:   proposal.deliveryType === '定期' ? '定期チャーター' : 'スポットチャーター',
    pickupAddress:    proposal.pickupAddress    ?? null,
    pickupDatetime:   proposal.pickupDatetime   ?? null,
    deliveryAddress:  proposal.deliveryAddress  ?? null,
    deliveryDeadline: proposal.deliveryDatetime ?? null,
    cargoType:        proposal.cargoType        ?? null,
    cargoQuantity:    proposal.cargoQuantity    ?? null,
    additionalWork:   proposal.additionalWork   ?? null,
    highwayUse:       highwayUse ? 'あり' : 'なし',
    customerPrice:    pricing.customerPrice.toString(),
    carrierCost:      pricing.carrierCost.toString(),
    grossProfit:      pricing.grossProfit.toString(),
    notes:            proposal.notes            ?? null,
    updatedAt:        new Date(),
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

router.post("/ai/start", requireAuth, async (req, res): Promise<void> => {
  const message: unknown = req.body?.message;
  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required" }); return;
  }

  const [shipment] = await db.insert(shipmentsTable).values({
    userId: req.session.userId,
    requestText: message,
    status: "ヒアリング中",
  }).returning();

  await db.insert(conversationsTable).values({ shipmentId: shipment.id, sender: "user", message });

  const completion = await openai.chat.completions.create({
    model: "gpt-5.6-luna",
    max_completion_tokens: 1024,
    messages: await buildMessages([], message),
  });

  const aiMessage = completion.choices[0]?.message?.content ?? "申し訳ありません。エラーが発生しました。";
  const proposal = extractProposal(aiMessage);
  const options = extractOptions(aiMessage);
  const visibleMessage = stripTags(aiMessage);

  await db.insert(conversationsTable).values({
    shipmentId: shipment.id,
    sender: "ai",
    message: visibleMessage,
    structuredData: JSON.stringify({ proposal: proposal || null, options: options || [] }),
  });

  if (proposal) {
    await db.update(shipmentsTable).set(await proposalToDbUpdate(proposal)).where(eq(shipmentsTable.id, shipment.id));
  }

  res.json({ message: visibleMessage, shipmentId: shipment.id, isComplete: !!proposal, options: options || [] });
});

router.post("/shipments/:id/conversations", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const rawMessage: unknown = req.body?.message;
  if (typeof rawMessage !== "string" || !rawMessage.trim()) {
    res.status(400).json({ error: "message is required" }); return;
  }
  const message = rawMessage;

  const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
  if (!shipment) { res.status(404).json({ error: "案件が見つかりません" }); return; }

  // Authorization: admin can access all; regular user can only message their own shipment
  const isAdmin = req.session.userRole === "admin";
  if (!isAdmin && shipment.userId !== req.session.userId) {
    res.status(403).json({ error: "アクセス権限がありません" }); return;
  }

  const history = await db.select().from(conversationsTable)
    .where(eq(conversationsTable.shipmentId, id))
    .orderBy(conversationsTable.createdAt);

  await db.insert(conversationsTable).values({ shipmentId: id, sender: "user", message });

  const completion = await openai.chat.completions.create({
    model: "gpt-5.6-luna",
    max_completion_tokens: 1024,
    messages: await buildMessages(history, message),
  });

  const aiMessage = completion.choices[0]?.message?.content ?? "申し訳ありません。エラーが発生しました。";
  const proposal = extractProposal(aiMessage);
  const options = extractOptions(aiMessage);
  const visibleMessage = stripTags(aiMessage);

  await db.insert(conversationsTable).values({
    shipmentId: id,
    sender: "ai",
    message: visibleMessage,
    structuredData: JSON.stringify({ proposal: proposal || null, options: options || [] }),
  });

  if (proposal) {
    await db.update(shipmentsTable).set(await proposalToDbUpdate(proposal)).where(eq(shipmentsTable.id, id));
  }

  res.json({ message: visibleMessage, shipmentId: id, isComplete: !!proposal, options: options || [] });
});

router.get("/shipments/:id/conversations", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  // Authorization: verify ownership before reading conversation history
  const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
  if (!shipment) { res.status(404).json({ error: "案件が見つかりません" }); return; }
  const isAdmin = req.session.userRole === "admin";
  if (!isAdmin && shipment.userId !== req.session.userId) {
    res.status(403).json({ error: "アクセス権限がありません" }); return;
  }

  const msgs = await db.select().from(conversationsTable)
    .where(eq(conversationsTable.shipmentId, id))
    .orderBy(conversationsTable.createdAt);

  res.json(msgs.map(m => ({
    ...m,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  })));
});

export default router;
