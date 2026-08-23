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

あなたの役割：
- ユーザーの軽バン利用ニーズを自然な会話で引き出す
- 用途（配送・移動販売・引越し・現場移動など）、エリア、必要期間、台数を確認する
- 具体的な提案やアドバイスをする
- 情報が揃ったら Chat VAN への登録を案内する

返答のルール：
- 1回の返答は短く（3〜4文以内）
- 質問は1回に1つまで
- 登録案内をする場合は https://chat-van.com/register を案内する`;

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

      const reply = completion.choices[0]?.message?.content?.trim()
        ?? "少々お待ちください。";

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
