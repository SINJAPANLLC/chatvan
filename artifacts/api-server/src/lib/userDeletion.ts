import { pool } from "@workspace/db";

export class UserDeletionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "UserDeletionError";
  }
}

/**
 * Remove an account and records that exist solely for that account.
 *
 * Database foreign keys intentionally protect account history from an
 * accidental parent-row delete. This helper makes the intentional deletion
 * explicit and atomic: either all dependent records and the account are
 * removed, or the transaction is rolled back.
 */
export async function deleteUserAccount(userId: number, actorUserId: number): Promise<void> {
  if (userId === actorUserId) {
    throw new UserDeletionError("自分自身のアカウントは削除できません。", 400);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query<{ id: number; role: string }>(
      "SELECT id, role FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const target = userResult.rows[0];
    if (!target) {
      throw new UserDeletionError("ユーザーが見つかりません。", 404);
    }

    if (target.role === "admin") {
      const adminCount = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE role = 'admin'",
      );
      if (Number(adminCount.rows[0]?.count ?? 0) <= 1) {
        throw new UserDeletionError("最後の管理者アカウントは削除できません。", 409);
      }
    }

    // Child records of shipments.
    await client.query(
      `DELETE FROM invoice_items
       WHERE shipment_id IN (SELECT id FROM shipments WHERE user_id = $1)
          OR invoice_id IN (
            SELECT id FROM invoices
            WHERE user_id = $1
               OR contract_id IN (SELECT id FROM van_contracts WHERE user_id = $1)
          )`,
      [userId],
    );
    await client.query(
      "DELETE FROM conversations WHERE shipment_id IN (SELECT id FROM shipments WHERE user_id = $1)",
      [userId],
    );
    await client.query(
      "DELETE FROM payments WHERE shipment_id IN (SELECT id FROM shipments WHERE user_id = $1)",
      [userId],
    );
    await client.query(
      `DELETE FROM notifications
       WHERE user_id = $1
          OR shipment_id IN (SELECT id FROM shipments WHERE user_id = $1)`,
      [userId],
    );
    await client.query("DELETE FROM shipments WHERE user_id = $1", [userId]);

    // Child records of van contracts, including return inspections.
    await client.query(
      `DELETE FROM return_inspections
       WHERE return_id IN (
         SELECT id FROM returns
         WHERE user_id = $1
            OR contract_id IN (SELECT id FROM van_contracts WHERE user_id = $1)
       )`,
      [userId],
    );
    await client.query(
      "DELETE FROM settlements WHERE contract_id IN (SELECT id FROM van_contracts WHERE user_id = $1)",
      [userId],
    );
    await client.query(
      `DELETE FROM contract_messages
       WHERE sender_id = $1
          OR contract_id IN (SELECT id FROM van_contracts WHERE user_id = $1)`,
      [userId],
    );
    await client.query(
      `DELETE FROM breakdowns
       WHERE user_id = $1
          OR contract_id IN (SELECT id FROM van_contracts WHERE user_id = $1)`,
      [userId],
    );
    await client.query(
      "DELETE FROM insurance_policies WHERE contract_id IN (SELECT id FROM van_contracts WHERE user_id = $1)",
      [userId],
    );
    await client.query(
      `DELETE FROM payment_retries
       WHERE user_id = $1
          OR contract_id IN (SELECT id FROM van_contracts WHERE user_id = $1)`,
      [userId],
    );
    await client.query(
      `DELETE FROM recovery_cases
       WHERE user_id = $1
          OR contract_id IN (SELECT id FROM van_contracts WHERE user_id = $1)`,
      [userId],
    );
    await client.query(
      `DELETE FROM returns
       WHERE user_id = $1
          OR contract_id IN (SELECT id FROM van_contracts WHERE user_id = $1)`,
      [userId],
    );
    await client.query(
      `DELETE FROM van_incidents
       WHERE user_id = $1
          OR contract_id IN (SELECT id FROM van_contracts WHERE user_id = $1)`,
      [userId],
    );
    await client.query(
      `DELETE FROM invoices
       WHERE user_id = $1
          OR contract_id IN (SELECT id FROM van_contracts WHERE user_id = $1)`,
      [userId],
    );
    await client.query("DELETE FROM van_contracts WHERE user_id = $1", [userId]);

    // Child records of applications. van_messages also cascades at the database
    // level, but deleting it explicitly keeps this operation understandable.
    await client.query(
      `DELETE FROM identity_verifications
       WHERE user_id = $1
          OR application_id IN (SELECT id FROM van_applications WHERE user_id = $1)`,
      [userId],
    );
    await client.query(
      `DELETE FROM screenings
       WHERE user_id = $1
          OR application_id IN (SELECT id FROM van_applications WHERE user_id = $1)`,
      [userId],
    );
    await client.query(
      "DELETE FROM van_proposals WHERE application_id IN (SELECT id FROM van_applications WHERE user_id = $1)",
      [userId],
    );
    await client.query(
      "DELETE FROM van_messages WHERE van_application_id IN (SELECT id FROM van_applications WHERE user_id = $1)",
      [userId],
    );
    await client.query("DELETE FROM van_applications WHERE user_id = $1", [userId]);

    // Account-scoped data and authentication tokens.
    await client.query("DELETE FROM upload_claims WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM auth_tokens WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);

    const deleted = await client.query("DELETE FROM users WHERE id = $1", [userId]);
    if (deleted.rowCount !== 1) {
      throw new UserDeletionError("ユーザーが見つかりません。", 404);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}