/**
 * Chat VAN enum migration: Japanese → English
 * Run once: pnpm --filter @workspace/db run migrate-enums
 */
import { db } from "./index";
import { sql } from "drizzle-orm";

async function migrateEnums() {
  console.log("Starting Chat VAN enum migration...");

  // ── van_applications ─────────────────────────────────────────────────────
  console.log("Migrating van_application_status...");
  await db.execute(sql`ALTER TABLE van_applications ALTER COLUMN status TYPE text`);
  await db.execute(sql`
    UPDATE van_applications SET status = CASE status
      WHEN '相談中'    THEN 'hearing'
      WHEN '確認中'    THEN 'vehicle_search'
      WHEN '提案送信済' THEN 'proposed'
      WHEN '申込受付'  THEN 'application_received'
      WHEN '審査中'    THEN 'screening'
      WHEN '提案確定'  THEN 'approved'
      WHEN '契約手続き' THEN 'contracting'
      WHEN '利用開始'  THEN 'delivery_pending'
      WHEN '利用中'    THEN 'active'
      WHEN '返却予定'  THEN 'return_pending'
      WHEN '契約終了'  THEN 'completed'
      WHEN 'キャンセル' THEN 'cancelled'
      ELSE 'hearing'
    END
  `);
  await db.execute(sql`DROP TYPE IF EXISTS van_application_status CASCADE`);

  // ── vehicles ──────────────────────────────────────────────────────────────
  console.log("Migrating vehicle_status...");
  await db.execute(sql`ALTER TABLE vehicles ALTER COLUMN status TYPE text`);
  await db.execute(sql`
    UPDATE vehicles SET status = CASE status
      WHEN '募集中'  THEN 'available'
      WHEN '商談中'  THEN 'proposed'
      WHEN '契約予定' THEN 'reserved'
      WHEN '貸出中'  THEN 'rented'
      WHEN '返却予定' THEN 'return_pending'
      WHEN '整備中'  THEN 'maintenance'
      WHEN '掲載停止' THEN 'suspended'
      ELSE 'draft'
    END
  `);
  await db.execute(sql`DROP TYPE IF EXISTS vehicle_status CASCADE`);

  // ── van_proposals ─────────────────────────────────────────────────────────
  console.log("Migrating van_proposal_status...");
  await db.execute(sql`ALTER TABLE van_proposals ALTER COLUMN status TYPE text`);
  await db.execute(sql`
    UPDATE van_proposals SET status = CASE status
      WHEN '送信済' THEN 'sent'
      WHEN '承認済' THEN 'accepted'
      WHEN '却下'   THEN 'rejected'
      ELSE 'sent'
    END
  `);
  await db.execute(sql`DROP TYPE IF EXISTS van_proposal_status CASCADE`);

  // ── van_contracts ─────────────────────────────────────────────────────────
  console.log("Migrating van_contract_status...");
  await db.execute(sql`ALTER TABLE van_contracts ALTER COLUMN status TYPE text`);
  await db.execute(sql`
    UPDATE van_contracts SET status = CASE status
      WHEN '契約手続き中' THEN 'contracting'
      WHEN '利用開始待ち' THEN 'pending_delivery'
      WHEN '利用中'      THEN 'active'
      WHEN '返却予定'    THEN 'return_pending'
      WHEN '契約終了'    THEN 'completed'
      WHEN '解約'        THEN 'cancelled'
      ELSE 'contracting'
    END
  `);
  await db.execute(sql`DROP TYPE IF EXISTS van_contract_status CASCADE`);

  // ── van_incidents ─────────────────────────────────────────────────────────
  console.log("Migrating van_incident_status...");
  await db.execute(sql`ALTER TABLE van_incidents ALTER COLUMN status TYPE text`);
  await db.execute(sql`
    UPDATE van_incidents SET status = CASE status
      WHEN '報告受付'  THEN 'received'
      WHEN '対応中'    THEN 'in_progress'
      WHEN '解決済み'  THEN 'resolved'
      ELSE 'received'
    END
  `);
  await db.execute(sql`DROP TYPE IF EXISTS van_incident_status CASCADE`);

  console.log("Enum migration completed successfully.");
}

migrateEnums().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});
