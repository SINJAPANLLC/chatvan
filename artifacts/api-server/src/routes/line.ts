import { Router } from "express";
import crypto from "crypto";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, lineConversationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

const MAX_HISTORY = 20;

const RESET_KEYWORDS = ["リセット", "やり直し", "最初から", "reset", "やりなおし"];

const SYSTEM_PROMPT = `あなたはChat VANのマスコット「SIN PANDA」です。
Chat VANは、軽バンのレンタルをチャットで完結できるサービスです。

キャラクター設定：
- 一人称は「僕」
- フレンドリーで親しみやすいパンダのキャラクター
- 語尾は「〜だよ」「〜だね」「〜かな」など自然なキャラ口調
- 明るくテンポよく、でも押しつけがましくない
- 絵文字は使わない

行動方針：
- ユーザーが何を言っても、1〜2文で共感・反応してから登録ページへ誘導する
- 長い会話や詳細なヒアリングはしない
- 必ず返答の最後に https://chat-van.com/register への登録を促す

返答例：
「それなら Chat VAN がぴったりだよ。まずは登録してみてほしいな。

▶ https://chat-van.com/register」

「なるほどね。詳しくは登録後にチャットで相談できるよ。

▶ https://chat-van.com/register」

返答のルール：
- 本文は1〜2文以内
- 本文の後に空行を1行入れて、必ず「▶ https://chat-van.com/register」を独立した行で末尾に含める
- 質問で返さない`;

router.post("/line/webhook", async (req: any, res) => {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    logger.error("LINE_CHANNEL_SECRET is not set");
    return res.status(500).send("Server configuration error");
  }

  // シグネチャ検証
  const signature = req.headers["x-line-signature"] as string;
  if (!signature) {
    return res.status(401).send("Missing x-line-signature");
  }

  const rawBody = req.rawBody ?? JSON.stringify(req.body);
  const expectedSig = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  if (expectedSig !== signature) {
    logger.warn("Invalid LINE webhook signature");
    return res.status(401).send("Invalid signature");
  }

  // LINE には即座に 200 を返す
  res.status(200).send("OK");

  const events: any[] = req.body.events ?? [];

  for (const event of events) {
    if (event.type !== "message" || event.message?.type !== "text") continue;

    const userId: string = event.source?.userId;
    const userText: string = event.message.text.trim();
    const replyToken: string = event.replyToken;

    if (!userId || !replyToken) continue;

    try {
      // リセットコマンド
      if (RESET_KEYWORDS.some((kw) => userText === kw)) {
        await db.delete(lineConversationsTable)
          .where(eq(lineConversationsTable.lineUserId, userId));

        await sendLineReply(replyToken, "わかった！話をリセットしたよ。改めて、どんな軽バンの使い方を考えてるか教えてほしいな。");
        continue;
      }

      // DBから会話履歴を取得（新しい順で取得して逆順に並べる）
      const rows = await db
        .select()
        .from(lineConversationsTable)
        .where(eq(lineConversationsTable.lineUserId, userId))
        .orderBy(desc(lineConversationsTable.createdAt))
        .limit(MAX_HISTORY);

      const history = rows
        .reverse()
        .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));

      // ユーザーメッセージをDBに保存
      await db.insert(lineConversationsTable).values({
        lineUserId: userId,
        role: "user",
        content: userText,
      });

      // OpenAI 呼び出し
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: userText },
        ],
        max_tokens: 400,
        temperature: 0.75,
      });

      const REGISTER_URL = "https://chat-van.com/register";
      const rawReply = completion.choices[0]?.message?.content?.trim()
        ?? "少々お待ちください。";
      // URLが含まれていれば除去してコードで付け直す（改行を確実に保証）
      const bodyText = rawReply
        .replace(/▶?\s*https?:\/\/chat-van\.com\/register/g, "")
        .trim();
      const reply = `${bodyText}\n\n▶ ${REGISTER_URL}`;

      // AI返答をDBに保存
      await db.insert(lineConversationsTable).values({
        lineUserId: userId,
        role: "assistant",
        content: reply,
      });

      await sendLineReply(replyToken, reply);
    } catch (err) {
      logger.error({ err, userId }, "LINE webhook processing error");
      await sendLineReply(
        replyToken,
        "ごめん、一時的なエラーが発生しちゃった。少し経ってから再度試してみてほしいな。"
      );
    }
  }
  return;
});

async function sendLineReply(replyToken: string, text: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    logger.error("LINE_CHANNEL_ACCESS_TOKEN is not set");
    return;
  }

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, "LINE reply API error");
    }
  } catch (err) {
    logger.error({ err }, "Failed to send LINE reply");
  }
}

export default router;
