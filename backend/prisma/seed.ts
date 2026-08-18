import { PrismaClient, RoleMode } from "@prisma/client";

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
] as const;

const categories = [
  {
    slug: "home-services",
    name_en: "Home services",
    name_bn: "বাসার সেবা",
    icon: "home",
  },
  {
    slug: "construction-trades",
    name_en: "Construction and trades",
    name_bn: "নির্মাণ ও কারিগরি",
    icon: "tools",
  },
  {
    slug: "care-support",
    name_en: "Care and support",
    name_bn: "যত্ন ও সহায়তা",
    icon: "care",
  },
  {
    slug: "transport-delivery",
    name_en: "Transport and delivery",
    name_bn: "পরিবহন ও ডেলিভারি",
    icon: "transport",
  },
  {
    slug: "education",
    name_en: "Education",
    name_bn: "শিক্ষা",
    icon: "education",
  },
  {
    slug: "digital-business",
    name_en: "Digital and business",
    name_bn: "ডিজিটাল ও ব্যবসায়িক",
    icon: "computer",
  },
  {
    slug: "events-hospitality",
    name_en: "Events and hospitality",
    name_bn: "অনুষ্ঠান ও আপ্যায়ন",
    icon: "event",
  },
  {
    slug: "general-labour",
    name_en: "General labour",
    name_bn: "সাধারণ শ্রম",
    icon: "work",
  },
] as const;

const skills = [
  ["cleaning", "Cleaning", "পরিষ্কার করা", "home-services"],
  ["cooking", "Cooking", "রান্না", "home-services"],
  [
    "electrical-work",
    "Electrical work",
    "বৈদ্যুতিক কাজ",
    "construction-trades",
  ],
  ["plumbing", "Plumbing", "প্লাম্বিং", "construction-trades"],
  ["elderly-care", "Elderly care", "বয়স্কদের যত্ন", "care-support"],
  ["childcare", "Childcare", "শিশু যত্ন", "care-support"],
  ["driving", "Driving", "গাড়ি চালানো", "transport-delivery"],
  ["delivery", "Delivery", "ডেলিভারি", "transport-delivery"],
  ["tutoring", "Tutoring", "পড়ানো", "education"],
  ["english-language", "English language", "ইংরেজি ভাষা", "education"],
  ["data-entry", "Data entry", "ডেটা এন্ট্রি", "digital-business"],
  ["graphic-design", "Graphic design", "গ্রাফিক ডিজাইন", "digital-business"],
  ["event-setup", "Event setup", "অনুষ্ঠান প্রস্তুতি", "events-hospitality"],
  ["food-service", "Food service", "খাবার পরিবেশন", "events-hospitality"],
  ["moving", "Moving", "মালামাল সরানো", "general-labour"],
  ["lifting", "Lifting", "ভার বহন", "general-labour"],
] as const;

const thanaNames = {
  Boalia: "বোয়ালিয়া",
  Motihar: "মতিহার",
  Rajpara: "রাজপাড়া",
  "Shah Makhdum": "শাহ মখদুম",
} as const;
const thanas = Object.keys(thanaNames) as (keyof typeof thanaNames)[];
const pilotAreas: Record<(typeof thanas)[number], readonly [string, string][]> =
  {
    Boalia: [
      ["Shaheb Bazar", "সাহেব বাজার"],
      ["Hetem Khan", "হেতেম খাঁ"],
      ["Padma R/A", "পদ্মা আবাসিক এলাকা"],
    ],
    Motihar: [
      ["RUET", "রুয়েট"],
      ["University of Rajshahi", "রাজশাহী বিশ্ববিদ্যালয়"],
      ["Talaimari", "তালাইমারী"],
      ["Kazla", "কাজলা"],
      ["Binodpur", "বিনোদপুর"],
      ["Motihar", "মতিহার"],
    ],
    Rajpara: [
      ["Laxmipur", "লক্ষ্মীপুর"],
      ["Court", "কোর্ট"],
      ["Rajpara", "রাজপাড়া"],
    ],
    "Shah Makhdum": [
      ["Shah Makhdum", "শাহ মখদুম"],
      ["Uposhohor", "উপশহর"],
      ["Novotheatre", "নভোথিয়েটার"],
    ],
  };

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

  await prisma.user.upsert({
    where: { email: "admin@kaj.local" },
    update: { is_admin: true, status: "ACTIVE" },
    create: {
      phone_e164: "+8801000000000",
      email: "admin@kaj.local",
      status: "ACTIVE",
      role_modes: [RoleMode.CUSTOMER, RoleMode.WORKER, RoleMode.BUSINESS],
      is_admin: true,
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
}

seed()
  .then(() => console.log("KAJ development seed applied idempotently."))
  .finally(async () => prisma.$disconnect());
