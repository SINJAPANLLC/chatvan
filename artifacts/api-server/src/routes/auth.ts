import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { LoginBody, RegisterBody } from "@workspace/api-zod";
import { generateToken, setToken, deleteToken, getToken } from "../lib/tokenStore";
import { requireAuth } from "../middlewares/auth";
import { sendEmail, buildEmailHtml } from "../lib/email";
import { logUserActivity } from "../lib/userLogger";

const router: IRouter = Router();

function formatUser(user: any) {
  const { passwordHash: _ph, ...safe } = user;
  return { ...safe, role: user.role, createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    logUserActivity({ action: "login_failed", detail: `未登録メール: ${email}`, req }).catch(() => {});
    res.status(401).json({ error: "メールアドレスまたはパスワードが間違っています" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    logUserActivity({ userId: user.id, userName: user.name, userEmail: user.email, action: "login_failed", detail: "パスワード不一致", req }).catch(() => {});
    res.status(401).json({ error: "メールアドレスまたはパスワードが間違っています" });
    return;
  }

  // Generate auth token (works regardless of cookie support)
  const token = generateToken();
  await setToken(token, { userId: user.id, userRole: user.role, userEmail: user.email });

  // Also set session (belt and suspenders)
  req.session.userId = user.id;
  req.session.userRole = user.role;
  req.session.userEmail = user.email;

  logUserActivity({ userId: user.id, userName: user.name, userEmail: user.email, action: "login", req }).catch(() => {});
  res.json({ user: formatUser(user), token });
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password, name, phone } = parsed.data;
  const companyName: string | undefined = typeof req.body?.companyName === "string" ? req.body.companyName : undefined;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing) {
    res.status(400).json({ error: "このメールアドレスは既に使用されています" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, name, companyName: companyName ?? null, phone: phone ?? null, role: "user" })
    .returning();

  const token = generateToken();
  await setToken(token, { userId: user.id, userRole: user.role, userEmail: user.email });

  req.session.userId = user.id;
  req.session.userRole = user.role;
  req.session.userEmail = user.email;

  // ウェルカムメール送信（非同期・失敗しても登録成功）
  sendEmail(
    user.email,
    '【Chat VAN】ご登録ありがとうございます',
    buildEmailHtml({
      subject: '【Chat VAN】ご登録ありがとうございます',
      recipientName: user.name ?? undefined,
      body: 'この度はChat VANにご登録いただきありがとうございます。\n\nチャットで希望条件を伝えるだけで、あなたに合った軽バンをご提案します。\nいつでもお気軽にご相談ください。',
      ctaText: 'Chat VANを使ってみる →',
    })
  ).catch(() => {});

  logUserActivity({ userId: user.id, userName: user.name, userEmail: user.email, action: "register", req }).catch(() => {});
  res.status(201).json({ user: formatUser(user), token });
});

// パスワードリセット要求
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: "メールアドレスを入力してください" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  // ユーザーが存在しなくても成功を返す（列挙攻撃防止）
  if (!user) { res.json({ ok: true }); return; }

  logUserActivity({ userId: user.id, userName: user.name, userEmail: user.email, action: "password_reset_request", req }).catch(() => {});
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1時間有効

  await db.execute(sql`
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES (${user.id}, ${token}, ${expiresAt})
  `);

  const baseUrl = process.env.APP_BASE_URL ?? "https://chat-van.com";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  sendEmail(
    user.email,
    '【Chat VAN】パスワードリセットのご案内',
    buildEmailHtml({
      subject: '【Chat VAN】パスワードリセットのご案内',
      recipientName: user.name ?? undefined,
      body: 'パスワードリセットのリクエストを受け付けました。\n\n下のボタンからパスワードを再設定してください。\nリンクの有効期限は1時間です。\n\n心当たりのない場合はこのメールを無視してください。',
      ctaText: 'パスワードを再設定する →',
    }).replace(
      'https://chat-van.com/',
      resetUrl
    )
  ).catch(() => {});

  res.json({ ok: true });
});

// パスワードリセット実行
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body;
  if (!token || !password) { res.status(400).json({ error: "無効なリクエストです" }); return; }
  if (password.length < 6) { res.status(400).json({ error: "パスワードは6文字以上で入力してください" }); return; }

  const rows = await db.execute(sql`
    SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
    FROM password_reset_tokens prt
    WHERE prt.token = ${token}
    LIMIT 1
  `);

  const row = (rows as any).rows?.[0] ?? (rows as any)[0];
  if (!row) { res.status(400).json({ error: "無効または期限切れのリンクです" }); return; }
  if (row.used_at) { res.status(400).json({ error: "このリンクは既に使用されています" }); return; }
  if (new Date(row.expires_at) < new Date()) { res.status(400).json({ error: "リンクの有効期限が切れています。もう一度リセットを申請してください" }); return; }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.update(usersTable).set({ passwordHash } as any).where(eq(usersTable.id, row.user_id));
  await db.execute(sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${row.id}`);

  res.json({ ok: true });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    await deleteToken(authHeader.slice(7));
  }
  const userId = req.session.userId;
  const userEmail = req.session.userEmail;
  req.session.destroy(() => {});
  if (userId) logUserActivity({ userId, userEmail: userEmail ?? null, action: "logout", req }).catch(() => {});
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "ユーザーが見つかりません" });
    return;
  }
  res.json(formatUser(user));
});

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const { name, companyName, phone, billingAddress, cardHolderName, cardBrand, cardLast4, cardExpiry, currentPassword, newPassword } = req.body as {
    name?: string;
    companyName?: string;
    phone?: string;
    billingAddress?: string;
    cardHolderName?: string;
    cardBrand?: string;
    cardLast4?: string;
    cardExpiry?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "ユーザーが見つかりません" });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};

  if (name !== undefined) updates.name = name;
  if (companyName !== undefined) updates.companyName = companyName;
  if (phone !== undefined) updates.phone = phone;
  if (billingAddress !== undefined) updates.billingAddress = billingAddress;
  if (cardHolderName !== undefined) updates.cardHolderName = cardHolderName;
  if (cardBrand !== undefined) updates.cardBrand = cardBrand;
  if (cardLast4 !== undefined) updates.cardLast4 = cardLast4;
  if (cardExpiry !== undefined) updates.cardExpiry = cardExpiry;

  if (newPassword) {
    if (!currentPassword) {
      res.status(400).json({ error: "現在のパスワードを入力してください" });
      return;
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "現在のパスワードが正しくありません" });
      return;
    }
    updates.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  if (Object.keys(updates).length === 0) {
    res.json(formatUser(user));
    return;
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id)).returning();
  logUserActivity({ userId: user.id, userName: user.name, userEmail: user.email, action: "profile_update", req }).catch(() => {});
  res.json(formatUser(updated));
});

export default router;
