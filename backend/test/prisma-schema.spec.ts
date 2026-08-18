import { readFileSync } from "node:fs";
import { join } from "node:path";

const prismaDirectory = join(__dirname, "..", "prisma");
const schema = readFileSync(join(prismaDirectory, "schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    prismaDirectory,
    "migrations",
    "20260818120000_schema_v1",
    "migration.sql",
  ),
  "utf8",
);
const seed = readFileSync(join(prismaDirectory, "seed.ts"), "utf8");

const d2Tables = [
  "users",
  "user_devices",
  "refresh_tokens",
  "otp_challenges",
  "profiles",
  "worker_profiles",
  "customer_profiles",
  "business_profiles",
  "skills",
  "user_skills",
  "categories",
  "locations",
  "service_areas",
  "jobs",
  "job_skills",
  "job_schedules",
  "job_status_history",
  "applications",
  "assignments",
  "contracts",
  "availability_rules",
  "availability_exceptions",
  "work_sessions",
  "payments",
  "ledger_entries",
  "payouts",
  "wallets",
  "reviews",
  "conversations",
  "conversation_participants",
  "messages",
  "notifications",
  "notification_preferences",
  "verification_requests",
  "documents",
  "disputes",
  "dispute_evidence",
  "reports",
  "moderation_actions",
  "badges",
  "user_badges",
  "saved_searches",
  "favorites",
  "feature_flags",
  "config_settings",
  "audit_logs",
] as const;

describe("Prisma D2 foundation", () => {
  it("creates every required D2 table", () => {
    for (const table of d2Tables) {
      expect(schema).toContain(`@@map("${table}")`);
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("uses database-backed UUID v7 defaults for model identifiers", () => {
    const modelIds = [...schema.matchAll(/^\s+id\s+String\s+@id[^\r\n]+$/gm)];
    expect(modelIds.length).toBeGreaterThan(30);
    for (const [definition] of modelIds) {
      expect(definition).toContain(
        '@default(dbgenerated("uuid_generate_v7()"))',
      );
    }
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION uuid_generate_v7()",
    );
    expect(migration).toContain("UUID NOT NULL DEFAULT uuid_generate_v7()");
  });

  it("contains all contract indexes including geographic distance", () => {
    for (const indexName of [
      "jobs_status_published_at_idx",
      "jobs_category_id_status_idx",
      "jobs_location_id_status_idx",
      "jobs_location_earth_idx",
      "applications_worker_user_id_status_idx",
      "applications_job_id_status_idx",
      "job_status_history_job_id_created_at_idx",
      "payments_idempotency_key_key",
      "messages_conversation_id_created_at_idx",
      "notifications_user_id_read_at_created_at_idx",
    ]) {
      expect(migration).toContain(`"${indexName}"`);
    }
  });

  it("keeps all feature flags off and seeds required configuration", () => {
    expect(seed).toContain('"payments_enabled"');
    expect(seed).toContain('"referral_enabled"');
    expect(seed).toContain("is_enabled: false");
    expect(seed).toContain('"platform.fees"');
    expect(seed).toContain('"matching.weights"');
    expect(seed).toContain('"cancellation.policy"');
  });
});
