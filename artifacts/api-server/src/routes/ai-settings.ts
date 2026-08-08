import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// GET /api/admin/ai-prompt
router.get("/admin/ai-prompt", requireAdmin, async (_req, res): Promise<void> => {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "ai_system_prompt"));
  res.json({ prompt: row?.value ?? "" });
});

// PUT /api/admin/ai-prompt
router.put("/admin/ai-prompt", requireAdmin, async (req, res): Promise<void> => {
  const { prompt } = req.body as { prompt: string };
  if (typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required" });
    return;
  }
  await db
    .insert(settingsTable)
    .values({ key: "ai_system_prompt", value: prompt })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: prompt, updatedAt: new Date() } });
  res.json({ ok: true });
});

export default router;
