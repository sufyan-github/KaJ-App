import { createHash } from "node:crypto";

import { AdminRole, PrismaClient, RoleMode } from "@prisma/client";
import { hash } from "bcryptjs";

import { encryptTotpSecret } from "../src/modules/admin-auth/admin-auth.primitives";
import {
  businessCategories,
  categories,
  pilotAreas,
  skills,
  thanaNames,
  thanas,
} from "./reference-data";

// This seed resets admin credentials, fees, settings, and feature flags.
// Refuse before constructing a client or performing any database work.
if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
  throw new Error(
    "Development seed requires NODE_ENV=development or test. Never run it against a production database.",
  );
}

const prisma = new PrismaClient();

const featureFlags = [
  "payments_enabled",
  "chat_enabled",
  "checkin_enabled",
  "recurring_jobs_enabled",
  "business_module_enabled",
  "ai_job_parsing_enabled",
  "ai_price_hint_enabled",
  "subscriptions_enabled",
  "featured_jobs_enabled",
  "worker_rates_customer",
  "disputes_enabled",
  "referral_enabled",
  "module_entitlements_enabled",
] as const;

const configSettings = [
  [
    "platform.fees",
    {
      feeBps: 800,
      minFeePoisha: 0,
      maxFeePoisha: null,
      payer: "worker",
      currency: "BDT",
    },
  ],
  [
    "matching.weights",
    {
      skill: 0.3,
      location: 0.15,
      availability: 0.15,
      budget: 0.1,
      experience: 0.1,
      rating: 0.1,
      reliability: 0.1,
    },
  ],
  [
    "cancellation.policy",
    {
      tiers: [
        {
          minHoursBefore: 24,
          customerPenalty: "none",
          workerPenalty: "none",
          refund: "full",
        },
        {
          minHoursBefore: 6,
          customerPenalty: "warning",
          workerPenalty: "reliability_-2",
          refund: "full",
        },
        {
          minHoursBefore: 2,
          customerPenalty: "fee_25pct",
          workerPenalty: "reliability_-5",
          refund: "partial_75",
        },
        {
          minHoursBefore: 0,
          customerPenalty: "fee_50pct",
          workerPenalty: "reliability_-10,strike",
          refund: "partial_50",
        },
      ],
      emergencyReasonCodes: [
        "ILLNESS",
        "ACCIDENT",
        "BEREAVEMENT",
        "NATURAL_EVENT",
      ],
      emergencyBehaviour: "no_penalty_pending_admin_review",
      strikesBeforeSuspension: 3,
      strikeWindowDays: 60,
    },
  ],
  ["assignment.settings", { confirmWindowMinutes: 120, autoConfirmHours: 48 }],
  [
    "attendance.settings",
    {
      geofenceRadiusM: 300,
      checkinWindowMinutes: 60,
      maxAccuracyM: 100,
      maxOfflineSyncMinutes: 15,
      maxClockSkewSeconds: 120,
      consentVersion: "location-checkin-v1",
    },
  ],
] as const;

const badges = [
  ["verified", "Verified", "যাচাইকৃত", "verified", { trust: true }],
  [
    "community-ambassador",
    "Community ambassador",
    "কমিউনিটি অ্যাম্বাসেডর",
    "campaign",
    { communityRole: "AMBASSADOR" },
  ],
  [
    "business-verified",
    "Business verified",
    "ব্যবসা যাচাইকৃত",
    "business",
    { trustLevel: "BUSINESS" },
  ],
  [
    "new-worker",
    "New worker",
    "নতুন কর্মী",
    "new_releases",
    { completedMax: 2 },
  ],
  [
    "reliable",
    "Reliable",
    "নির্ভরযোগ্য",
    "handshake",
    { completedMin: 5, completionRateBpsMin: 9000 },
  ],
  [
    "top-rated",
    "Top rated",
    "সেরা রেটিং",
    "star",
    { ratingCountMin: 10, ratingAverageMin: 4.8 },
  ],
  [
    "experienced",
    "Experienced",
    "অভিজ্ঞ",
    "workspace_premium",
    { completedMin: 25 },
  ],
] as const;

async function seed() {
  const categoryIds = new Map<string, string>();
  for (const [sort_order, category] of categories.entries()) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { ...category, sort_order, is_active: true },
      create: { ...category, sort_order },
    });
    categoryIds.set(saved.slug, saved.id);
  }

  for (const [sort_order, sector] of businessCategories.entries()) {
    await prisma.businessCategory.upsert({
      where: { slug: sector.slug },
      update: { ...sector, sort_order, is_active: true },
      create: { ...sector, sort_order },
    });
  }

  for (const [slug, name_en, name_bn, categorySlug] of skills) {
    const category_id = categoryIds.get(categorySlug);
    if (!category_id) throw new Error(`Missing seed category: ${categorySlug}`);
    await prisma.skill.upsert({
      where: { slug },
      update: { name_en, name_bn, category_id, is_active: true },
      create: { slug, name_en, name_bn, category_id },
    });
  }

  const existingCity = await prisma.location.findFirst({
    where: { parent_id: null, type: "CITY", name_en: "Rajshahi" },
  });
  const city = existingCity
    ? await prisma.location.update({
        where: { id: existingCity.id },
        data: { name_bn: "রাজশাহী", is_active: true },
      })
    : await prisma.location.create({
        data: { type: "CITY", name_en: "Rajshahi", name_bn: "রাজশাহী" },
      });

  for (const thanaName of thanas) {
    const thana = await prisma.location.upsert({
      where: {
        parent_id_type_name_en: {
          parent_id: city.id,
          type: "THANA",
          name_en: thanaName,
        },
      },
      update: { name_bn: thanaNames[thanaName], is_active: true },
      create: {
        parent_id: city.id,
        type: "THANA",
        name_en: thanaName,
        name_bn: thanaNames[thanaName],
      },
    });
    for (const [name_en, name_bn] of pilotAreas[thanaName]) {
      await prisma.location.upsert({
        where: {
          parent_id_type_name_en: {
            parent_id: thana.id,
            type: "AREA",
            name_en,
          },
        },
        update: { name_bn, is_active: true },
        create: { parent_id: thana.id, type: "AREA", name_en, name_bn },
      });
    }
  }

  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? "admin@kaj.local";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "KajAdminLocal123!";
  const adminTotpSecret =
    process.env.ADMIN_SEED_TOTP_SECRET ?? "JBSWY3DPEHPK3PXP";
  const adminEncryptionKey =
    process.env.ADMIN_TOTP_ENCRYPTION_KEY ||
    createHash("sha256")
      .update("kaj:admin-totp:local-development-only")
      .digest("hex");
  const passwordHash = await hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      is_admin: true,
      password_hash: passwordHash,
      status: "ACTIVE",
    },
    create: {
      phone_e164: "+8801000000000",
      email: adminEmail,
      password_hash: passwordHash,
      status: "ACTIVE",
      role_modes: [RoleMode.CUSTOMER, RoleMode.WORKER, RoleMode.BUSINESS],
      is_admin: true,
    },
  });
  await prisma.adminCredential.upsert({
    where: { user_id: admin.id },
    update: {
      role: AdminRole.ADMIN,
      totp_secret_ciphertext: encryptTotpSecret(
        adminTotpSecret,
        adminEncryptionKey,
      ),
      totp_confirmed_at: new Date(),
      last_totp_counter: null,
    },
    create: {
      user_id: admin.id,
      role: AdminRole.ADMIN,
      totp_secret_ciphertext: encryptTotpSecret(
        adminTotpSecret,
        adminEncryptionKey,
      ),
      totp_confirmed_at: new Date(),
    },
  });

  for (const key of featureFlags) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: { is_enabled: false, rollout_percent: 0 },
      create: { key, is_enabled: false, rollout_percent: 0 },
    });
  }

  for (const [key, value_json] of configSettings) {
    await prisma.configSetting.upsert({
      where: { key },
      update: { value_json },
      create: { key, value_json },
    });
  }

  await prisma.feeRule.upsert({
    where: { scope_key: "GLOBAL:*" },
    update: {
      scope: "GLOBAL",
      fee_bps: 800,
      min_fee_poisha: 0,
      max_fee_poisha: null,
      payer: "worker",
      is_active: true,
    },
    create: {
      scope: "GLOBAL",
      scope_key: "GLOBAL:*",
      fee_bps: 800,
      payer: "worker",
    },
  });

  // Development-only carrier plan matching the BDApps daily charging product
  // (Tk 2.78/day). Production plans are created by an administrator.
  const carrierPlan = {
    name_en: "Daily subscription",
    name_bn: "দৈনিক সাবস্ক্রিপশন",
    description_en: "Tk 2.78/day + VAT, renews daily through Robi/Cirkle.",
    description_bn: "৳২.৭৮/দিন + ভ্যাট, প্রতিদিন নবায়ন (রবি/সার্কেল)।",
    price_poisha: 278n,
    currency: "BDT",
    duration_days: 1,
    feature_keys: [
      "DIRECT_CONTACT",
      "JOB_APPLICATION",
      "JOB_POSTING",
      "WORKER_DISCOVERY",
      "WORKER_HIRING",
    ],
    is_active: true,
    sort_order: 0,
  };
  await prisma.subscriptionPlan.upsert({
    where: { code: process.env.BDAPPS_PLAN_CODE || "bdapps-daily" },
    update: carrierPlan,
    create: {
      code: process.env.BDAPPS_PLAN_CODE || "bdapps-daily",
      ...carrierPlan,
    },
  });

  for (const [slug, name_en, name_bn, icon, rule_json] of badges) {
    await prisma.badge.upsert({
      where: { slug },
      update: { name_en, name_bn, icon, rule_json },
      create: { slug, name_en, name_bn, icon, rule_json },
    });
  }
}

seed()
  .then(() => console.log("KAJ development seed applied idempotently."))
  .finally(async () => prisma.$disconnect());
