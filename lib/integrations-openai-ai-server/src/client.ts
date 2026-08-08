import OpenAI from "openai";

// Replit AI Integration プロキシ → 標準 OpenAI API へ移行
// 優先順位: OPENAI_API_KEY (標準) → AI_INTEGRATIONS_OPENAI_API_KEY (Replit旧)
const apiKey =
  process.env.OPENAI_API_KEY ||
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

const baseURL =
  process.env.OPENAI_BASE_URL ||
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
  "https://api.openai.com/v1";

if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY must be set. Please add your OpenAI API key as an environment variable.",
  );
}

export const openai = new OpenAI({ apiKey, baseURL });
