import app from "./app";
import { logger } from "./lib/logger";
import { seedRequiredAccounts } from "./lib/seed";
import { startScheduler } from "./lib/blogAutoGen";
import { startAutoProspect } from "./lib/autoProspect";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function runMigrations() {
  // ─── 既存 migration ───────────────────────────────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS master_card_data TEXT`);
    await db.execute(sql`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS stops_json TEXT`);
    logger.info("migration: master_card_data / stops_json columns ready");
  } catch (e: any) {
    logger.warn({ err: e.message }, "migration warning (non-fatal)");
  }

  // ─── van_application_status: 日本語 → 英語 ───────────────────────────────
  try {
    // DEFAULT を落としてから text に変換し、enum を作り直す
    await db.execute(sql`ALTER TABLE van_applications ALTER COLUMN status DROP DEFAULT`);
    await db.execute(sql`ALTER TABLE van_applications ALTER COLUMN status TYPE text`);
    await db.execute(sql`DROP TYPE IF EXISTS van_application_status`);
    await db.execute(sql`
      UPDATE van_applications SET status = CASE status
        WHEN '相談中'     THEN 'new'
        WHEN '確認中'     THEN 'hearing'
        WHEN '提案送信済' THEN 'proposed'
        WHEN '申込受付'   THEN 'application_received'
        WHEN '審査中'     THEN 'screening'
        WHEN '提案確定'   THEN 'approved'
        WHEN '契約手続き' THEN 'contracting'
        WHEN '利用開始'   THEN 'delivery_pending'
        WHEN '利用中'     THEN 'active'
        WHEN '返却予定'   THEN 'return_pending'
        WHEN '契約終了'   THEN 'completed'
        WHEN 'キャンセル' THEN 'cancelled'
        ELSE status
      END
    `);
    await db.execute(sql`
      CREATE TYPE van_application_status AS ENUM (
        'new','hearing','vehicle_search','proposal_ready','proposed',
        'application_received','screening','approved','contracting',
        'payment_pending','delivery_pending','active','payment_issue',
        'return_pending','completed','cancelled','rejected'
      )
    `);
    await db.execute(sql`
      ALTER TABLE van_applications
        ALTER COLUMN status TYPE van_application_status
        USING status::van_application_status,
        ALTER COLUMN status SET DEFAULT 'new'
    `);
    logger.info("migration: van_application_status → English");
  } catch (e: any) {
    logger.warn({ err: e.message }, "van_application_status migration (non-fatal)");
  }

  // ─── vehicle_status: 日本語 → 英語 ──────────────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE vehicles ALTER COLUMN status DROP DEFAULT`);
    await db.execute(sql`ALTER TABLE vehicles ALTER COLUMN status TYPE text`);
    await db.execute(sql`DROP TYPE IF EXISTS vehicle_status`);
    await db.execute(sql`
      UPDATE vehicles SET status = CASE status
        WHEN '募集中'   THEN 'available'
        WHEN '商談中'   THEN 'proposed'
        WHEN '契約予定' THEN 'reserved'
        WHEN '貸出中'   THEN 'rented'
        WHEN '返却予定' THEN 'return_pending'
        WHEN '整備中'   THEN 'maintenance'
        WHEN '掲載停止' THEN 'unavailable'
        ELSE status
      END
    `);
    await db.execute(sql`
      CREATE TYPE vehicle_status AS ENUM (
        'draft','reviewing','available','proposed','reserved',
        'rented','return_pending','maintenance','suspended','unavailable'
      )
    `);
    await db.execute(sql`
      ALTER TABLE vehicles
        ALTER COLUMN status TYPE vehicle_status
        USING status::vehicle_status,
        ALTER COLUMN status SET DEFAULT 'draft'
    `);
    logger.info("migration: vehicle_status → English");
  } catch (e: any) {
    logger.warn({ err: e.message }, "vehicle_status migration (non-fatal)");
  }

  // ─── van_contract_status: 日本語 → 英語 ──────────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE van_contracts ALTER COLUMN status DROP DEFAULT`);
    await db.execute(sql`ALTER TABLE van_contracts ALTER COLUMN status TYPE text`);
    await db.execute(sql`DROP TYPE IF EXISTS van_contract_status`);
    await db.execute(sql`
      UPDATE van_contracts SET status = CASE status
        WHEN '契約手続き中' THEN 'pending_documents'
        WHEN '利用開始待ち' THEN 'pending_payment'
        WHEN '利用中'       THEN 'active'
        WHEN '返却予定'     THEN 'return_pending'
        WHEN '契約終了'     THEN 'completed'
        WHEN '解約'         THEN 'cancelled'
        ELSE status
      END
    `);
    await db.execute(sql`
      CREATE TYPE van_contract_status AS ENUM (
        'draft','pending_documents','pending_signature','pending_payment',
        'active','payment_issue','return_pending','completed','cancelled'
      )
    `);
    await db.execute(sql`
      ALTER TABLE van_contracts
        ALTER COLUMN status TYPE van_contract_status
        USING status::van_contract_status,
        ALTER COLUMN status SET DEFAULT 'draft'
    `);
    logger.info("migration: van_contract_status → English");
  } catch (e: any) {
    logger.warn({ err: e.message }, "van_contract_status migration (non-fatal)");
  }

  // ─── 既存テーブルにカラム追加 ─────────────────────────────────────────────
  const alterCols: string[] = [
    // van_applications
    "ALTER TABLE van_applications ADD COLUMN IF NOT EXISTS assigned_admin_id INTEGER",
    "ALTER TABLE van_applications ADD COLUMN IF NOT EXISTS prefecture TEXT",
    "ALTER TABLE van_applications ADD COLUMN IF NOT EXISTS delivery_type TEXT",
    "ALTER TABLE van_applications ADD COLUMN IF NOT EXISTS ai_summary TEXT",
    "ALTER TABLE van_applications ADD COLUMN IF NOT EXISTS current_vehicle TEXT",
    // vehicles
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS grade TEXT",
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vin TEXT",
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS license_plate TEXT",
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS black_number_status TEXT",
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS gps_device_id TEXT",
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS smoking_policy TEXT DEFAULT 'no_smoking'",
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS max_period_months INTEGER",
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mileage_limit INTEGER",
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS excess_mileage_fee NUMERIC(10,2)",
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS compulsory_insurance_expiry TEXT",
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_expiry TEXT",
    "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
    // rental_companies
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS corporate_name TEXT",
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS service_areas TEXT",
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS payment_terms TEXT",
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS bank_information TEXT",
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS business_hours TEXT",
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS emergency_contact TEXT",
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS accident_contact TEXT",
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS breakdown_contact TEXT",
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS recovery_contact TEXT",
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS insurance_conditions TEXT",
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS contract_start_date TEXT",
    "ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
    // van_contracts
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS contract_number TEXT",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS rental_company_id INTEGER",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS platform_operator TEXT DEFAULT 'SIN JAPAN株式会社'",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS contract_provider TEXT",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS vehicle_provider TEXT",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS planned_end_date TEXT",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS minimum_term INTEGER",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS platform_contract_agreed_at TIMESTAMP",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS vehicle_contract_agreed_at TIMESTAMP",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMP",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS signature_data TEXT",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS special_terms TEXT",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS termination_terms TEXT",
    "ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS return_terms TEXT",
  ];
  for (const q of alterCols) {
    try { await db.execute(sql.raw(q)); } catch (e: any) {
      logger.warn({ err: e.message }, `alter col (non-fatal): ${q.slice(0, 60)}`);
    }
  }

  // ─── rental_company_status enum & column ────────────────────────────────
  try {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE rental_company_status AS ENUM ('prospect','reviewing','active','suspended','terminated');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await db.execute(sql`
      ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS status rental_company_status NOT NULL DEFAULT 'prospect'
    `);
    logger.info("migration: rental_company_status ready");
  } catch (e: any) {
    logger.warn({ err: e.message }, "rental_company_status (non-fatal)");
  }

  // ─── 新規テーブル ─────────────────────────────────────────────────────────
  const createTables: string[] = [
    `CREATE TABLE IF NOT EXISTS identity_verifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      application_id INTEGER REFERENCES van_applications(id),
      full_name TEXT, birth_date TEXT, address TEXT, phone TEXT, email TEXT,
      license_front TEXT, license_back TEXT,
      license_expiry TEXT, license_type TEXT, license_number TEXT,
      emergency_contact_name TEXT, emergency_contact_phone TEXT, emergency_contact_relation TEXT,
      status TEXT NOT NULL DEFAULT 'not_started',
      verified_by INTEGER, verified_at TIMESTAMP, rejection_reason TEXT, notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS insurance_policies (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER REFERENCES vehicles(id),
      contract_id INTEGER REFERENCES van_contracts(id),
      insurance_company TEXT NOT NULL,
      policy_number TEXT, start_date TEXT, expiry_date TEXT NOT NULL,
      bodily_injury TEXT, property_damage TEXT, vehicle_coverage TEXT,
      personal_injury TEXT, deductible TEXT,
      driver_conditions TEXT, age_conditions TEXT,
      commercial_use_allowed BOOLEAN DEFAULT FALSE,
      policy_document TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS gps_devices (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER REFERENCES vehicles(id) NOT NULL,
      provider TEXT, device_identifier TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      installed_at TIMESTAMP, notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS gps_locations (
      id SERIAL PRIMARY KEY,
      gps_device_id INTEGER REFERENCES gps_devices(id) NOT NULL,
      latitude TEXT NOT NULL, longitude TEXT NOT NULL,
      address TEXT, ignition_status TEXT,
      mileage INTEGER, battery TEXT, speed INTEGER,
      recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS screenings (
      id SERIAL PRIMARY KEY,
      application_id INTEGER REFERENCES van_applications(id) NOT NULL,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      result TEXT NOT NULL DEFAULT 'pending',
      reason TEXT, risk_notes TEXT, conditions TEXT,
      reviewed_by INTEGER, reviewed_at TIMESTAMP, notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS breakdowns (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER REFERENCES van_contracts(id),
      user_id INTEGER REFERENCES users(id) NOT NULL,
      symptom TEXT, warning_lights TEXT, occurred_at TEXT,
      location TEXT, can_drive BOOLEAN, photos TEXT, videos TEXT,
      user_comment TEXT, ai_summary TEXT,
      status TEXT NOT NULL DEFAULT 'reported',
      admin_notes TEXT, rental_company_notified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS returns (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER REFERENCES van_contracts(id) NOT NULL,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      vehicle_id INTEGER REFERENCES vehicles(id) NOT NULL,
      requested_return_date TEXT, return_location TEXT, return_reason TEXT,
      status TEXT NOT NULL DEFAULT 'requested',
      actual_return_date TEXT, admin_notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS return_inspections (
      id SERIAL PRIMARY KEY,
      return_id INTEGER REFERENCES returns(id) NOT NULL,
      mileage_at_return INTEGER, fuel_level TEXT,
      exterior_photos TEXT, interior_photos TEXT,
      damage_notes TEXT, cleaning_condition TEXT,
      has_key TEXT, has_etc_card TEXT, accessories TEXT,
      additional_charges TEXT, total_additional_amount NUMERIC(10,2) DEFAULT 0,
      inspected_by INTEGER, inspected_at TIMESTAMP, notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS recovery_cases (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER REFERENCES van_contracts(id) NOT NULL,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      vehicle_id INTEGER REFERENCES vehicles(id) NOT NULL,
      return_deadline TEXT, contact_history TEXT,
      emergency_contact_history TEXT,
      gps_last_location TEXT, gps_last_seen TIMESTAMP,
      gps_report_document TEXT,
      rental_company_contact TEXT, recovery_provider TEXT,
      recovery_requested_at TIMESTAMP, recovered_at TIMESTAMP,
      recovery_cost NUMERIC(10,2),
      status TEXT NOT NULL DEFAULT 'contacting', notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER, actor_type TEXT, actor_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT, target_id TEXT,
      before_data TEXT, after_data TEXT,
      ip_address TEXT, user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS settlements (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER REFERENCES van_contracts(id) NOT NULL,
      rental_company_id INTEGER REFERENCES rental_companies(id) NOT NULL,
      period_month TEXT NOT NULL,
      user_payment_amount NUMERIC(10,2), rental_company_amount NUMERIC(10,2),
      chat_van_fee NUMERIC(10,2),
      scheduled_date TEXT, completed_at TIMESTAMP, transfer_reference TEXT,
      status TEXT NOT NULL DEFAULT 'pending', notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS payment_retries (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER REFERENCES van_contracts(id) NOT NULL,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      period_month TEXT NOT NULL, amount NUMERIC(10,2) NOT NULL,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      attempted_at TIMESTAMP DEFAULT NOW() NOT NULL,
      result TEXT, failure_reason TEXT, square_payment_id TEXT,
      next_retry_at TIMESTAMP, notification_sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS vehicle_images (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER REFERENCES vehicles(id) NOT NULL,
      object_path TEXT NOT NULL, label TEXT,
      sort_order INTEGER DEFAULT 0, is_primary BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
  ];

  for (const q of createTables) {
    try {
      await db.execute(sql.raw(q));
    } catch (e: any) {
      logger.warn({ err: e.message }, `create table (non-fatal): ${q.slice(0, 60)}`);
    }
  }

  logger.info("migration: all Chat VAN tables ready");
}

const port = Number(process.env.PORT ?? 8080);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  runMigrations();
  seedRequiredAccounts();
  startScheduler();
  startAutoProspect();
});
