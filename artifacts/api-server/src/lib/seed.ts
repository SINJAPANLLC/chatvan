import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const REQUIRED_ACCOUNTS = [
  {
    email: "info@chat-van.com",
    password: "Kazuya8008",
    name: "SINJAPAN",
    companyName: "SINJAPAN株式会社",
    role: "admin" as const,
  },
  {
    email: "admin@sinjapan.co.jp",
    password: "password",
    name: "SINJAPAN管理者",
    companyName: "SINJAPAN株式会社",
    role: "admin" as const,
  },
];

export async function seedRequiredAccounts() {
  try {
    for (const account of REQUIRED_ACCOUNTS) {
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, account.email))
        .limit(1);

      if (!existing) {
        const passwordHash = await bcrypt.hash(account.password, 10);
        await db.insert(usersTable).values({
          email: account.email,
          passwordHash,
          name: account.name,
          companyName: account.companyName,
          role: account.role,
        });
        logger.info(`Created account: ${account.email}`);
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed required accounts");
  }
}
