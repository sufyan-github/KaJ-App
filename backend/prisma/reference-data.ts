import { LocationType, Prisma, PrismaClient } from "@prisma/client";

/**
 * Reference data: the catalogue (categories, skills) and the Rajshahi pilot
 * locations (city → thanas → areas), in Bangla and English. The single
 * source for the development seed and the production-safe loader
 * (reference-data-load.ts). It contains no accounts, credentials, flags or
 * settings.
 */

export const categories = [
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

export const skills = [
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

export const thanaNames = {
  Boalia: "বোয়ালিয়া",
  Motihar: "মতিহার",
  Rajpara: "রাজপাড়া",
  "Shah Makhdum": "শাহ মখদুম",
} as const;
export const thanas = Object.keys(thanaNames) as (keyof typeof thanaNames)[];
export const pilotAreas: Record<
  (typeof thanas)[number],
  readonly [string, string][]
> = {
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

export interface ReferenceDataReport {
  created: { categories: number; skills: number; locations: number };
  existing: { categories: number; skills: number; locations: number };
}

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Creates whatever reference rows are missing and touches nothing else.
 * Existing rows are left exactly as they are — an admin's renamed category,
 * deactivated skill or re-ordered list survives — so it is safe to run on
 * production and idempotent: the second run creates nothing. `dryRun` only
 * counts.
 */
export async function loadReferenceData(
  prisma: Client,
  options: { dryRun?: boolean } = {},
): Promise<ReferenceDataReport> {
  const write = !options.dryRun;
  const report: ReferenceDataReport = {
    created: { categories: 0, skills: 0, locations: 0 },
    existing: { categories: 0, skills: 0, locations: 0 },
  };

  const categoryIds = new Map<string, string | null>();
  for (const [sort_order, category] of categories.entries()) {
    const found = await prisma.category.findUnique({
      where: { slug: category.slug },
      select: { id: true },
    });
    if (found) {
      report.existing.categories += 1;
      categoryIds.set(category.slug, found.id);
      continue;
    }
    report.created.categories += 1;
    categoryIds.set(
      category.slug,
      write
        ? (
            await prisma.category.create({
              data: { ...category, sort_order },
              select: { id: true },
            })
          ).id
        : null,
    );
  }

  for (const [slug, name_en, name_bn, categorySlug] of skills) {
    const found = await prisma.skill.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (found) {
      report.existing.skills += 1;
      continue;
    }
    report.created.skills += 1;
    const category_id = categoryIds.get(categorySlug);
    if (write) {
      if (!category_id)
        throw new Error(`Missing reference category: ${categorySlug}`);
      await prisma.skill.create({
        data: { slug, name_en, name_bn, category_id },
      });
    }
  }

  // The city has no parent, so the (parent, type, name) unique key cannot
  // match it (NULLs are distinct); find it by name instead.
  let city = await prisma.location.findFirst({
    where: { parent_id: null, type: LocationType.CITY, name_en: "Rajshahi" },
    select: { id: true },
  });
  if (city) report.existing.locations += 1;
  else {
    report.created.locations += 1;
    if (write)
      city = await prisma.location.create({
        data: {
          type: LocationType.CITY,
          name_en: "Rajshahi",
          name_bn: "রাজশাহী",
        },
        select: { id: true },
      });
  }

  const ensureChild = async (
    parentId: string | null,
    type: LocationType,
    name_en: string,
    name_bn: string,
  ) => {
    if (parentId) {
      const found = await prisma.location.findUnique({
        where: {
          parent_id_type_name_en: { parent_id: parentId, type, name_en },
        },
        select: { id: true },
      });
      if (found) {
        report.existing.locations += 1;
        return found.id;
      }
    }
    report.created.locations += 1;
    if (!write || !parentId) return null;
    return (
      await prisma.location.create({
        data: { parent_id: parentId, type, name_en, name_bn },
        select: { id: true },
      })
    ).id;
  };

  for (const thanaName of thanas) {
    const thanaId = await ensureChild(
      city?.id ?? null,
      LocationType.THANA,
      thanaName,
      thanaNames[thanaName],
    );
    for (const [name_en, name_bn] of pilotAreas[thanaName])
      await ensureChild(thanaId, LocationType.AREA, name_en, name_bn);
  }

  return report;
}
