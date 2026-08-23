import { Router } from "express";
import crypto from "crypto";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router = Router();

// 会話履歴をユーザーIDごとにメモリで管理
const conversations = new Map<string, { role: "user" | "assistant"; content: string }[]>();
const MAX_HISTORY = 20;

const SYSTEM_PROMPT = `あなたはChat VANの壁打ち相談ボットです。
Chat VANは、軽バンのレンタルをチャットで完結できるサービスです。

あなたの役割：
- ユーザーの軽バン利用ニーズを自然な会話で引き出す
- 用途（配送・移動販売・引越し・現場移動など）、エリア、必要期間、台数を確認する
- 具体的な提案やアドバイスを行う
- 情報が揃ったらChat VANへの登録を案内する

返答のルール：
- 1回の返答は短く（3〜4文以内）
- 絵文字は使わない
- 丁寧だが堅すぎない口調（です・ます調）
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
    const userText: string = event.message.text;
    const replyToken: string = event.replyToken;

    if (!userId || !replyToken) continue;

    try {
      // 会話履歴を取得・更新
      if (!conversations.has(userId)) {
        conversations.set(userId, []);
      }
      const history = conversations.get(userId)!;
      history.push({ role: "user", content: userText });

      // 長くなりすぎたら古い履歴を削除
      while (history.length > MAX_HISTORY) history.shift();

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
        ],
        max_tokens: 400,
        temperature: 0.75,
      });

      const reply = completion.choices[0]?.message?.content?.trim()
        ?? "少々お待ちください。";

      history.push({ role: "assistant", content: reply });

      await sendLineReply(replyToken, reply);
    } catch (err) {
      logger.error({ err, userId }, "LINE webhook processing error");
      await sendLineReply(
        replyToken,
        "申し訳ありません、一時的なエラーが発生しました。少し経ってから再度お試しください。"
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
