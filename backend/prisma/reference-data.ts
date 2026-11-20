import { LocationType, Prisma, PrismaClient } from "@prisma/client";

/**
 * Reference data: the catalogue (categories, skills), the business sectors and the Rajshahi pilot
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

/**
 * W1: an approximate centre and radius for each pilot area, so check-in at a
 * job or session without its own map pin can use the area as the geofence
 * (attendance.service jobLocation). The centres are approximate (landmark
 * level, about 1 km); the radius allows for that. Admins can correct them in
 * the console; the loader fills only areas with no centre and never moves
 * one that is set.
 */
export const areaCentres: Record<
  string,
  { lat: number; lng: number; radiusKm: number }
> = {
  "Shaheb Bazar": { lat: 24.3655, lng: 88.5985, radiusKm: 1.5 },
  "Hetem Khan": { lat: 24.3705, lng: 88.596, radiusKm: 1.5 },
  "Padma R/A": { lat: 24.3745, lng: 88.6135, radiusKm: 1.5 },
  RUET: { lat: 24.3635, lng: 88.628, radiusKm: 1.5 },
  "University of Rajshahi": { lat: 24.3695, lng: 88.6385, radiusKm: 2 },
  Talaimari: { lat: 24.3605, lng: 88.6235, radiusKm: 1.5 },
  Kazla: { lat: 24.364, lng: 88.634, radiusKm: 1.5 },
  Binodpur: { lat: 24.3745, lng: 88.643, radiusKm: 1.5 },
  Motihar: { lat: 24.368, lng: 88.645, radiusKm: 2 },
  Laxmipur: { lat: 24.372, lng: 88.587, radiusKm: 1.5 },
  Court: { lat: 24.377, lng: 88.568, radiusKm: 1.5 },
  Rajpara: { lat: 24.379, lng: 88.581, radiusKm: 1.5 },
  "Shah Makhdum": { lat: 24.405, lng: 88.612, radiusKm: 2.5 },
  Uposhohor: { lat: 24.3845, lng: 88.613, radiusKm: 1.5 },
  Novotheatre: { lat: 24.392, lng: 88.62, radiusKm: 1.5 },
};

/**
 * Gives each pilot area without a centre its reference centre and radius.
 * Areas with a centre (seeded earlier or set by an admin) are left alone.
 * Returns how many were (or, in a dry run, would be) set.
 */
export async function fillAreaCentres(
  prisma: PrismaClient | Prisma.TransactionClient,
  options: { dryRun?: boolean } = {},
): Promise<number> {
  const areas = await prisma.location.findMany({
    where: {
      type: LocationType.AREA,
      name_en: { in: Object.keys(areaCentres) },
      lat: null,
      lng: null,
    },
    select: { id: true, name_en: true },
  });
  if (!options.dryRun)
    for (const area of areas) {
      const centre = areaCentres[area.name_en]!;
      await prisma.location.update({
        where: { id: area.id },
        data: {
          lat: centre.lat,
          lng: centre.lng,
          radius_km: centre.radiusKm,
        },
      });
    }
  return areas.length;
}

/**
 * P2: the sector taxonomy for businesses and ideas (business_categories).
 * Admins can rename, reorder, deactivate or add sub-sectors; the loader
 * only adds missing slugs.
 */
export const businessCategories = [
  {
    slug: "agriculture",
    name_en: "Agriculture and farming",
    name_bn: "কৃষি ও খামার",
    icon: "agriculture",
  },
  {
    slug: "technology",
    name_en: "Technology",
    name_bn: "প্রযুক্তি",
    icon: "computer",
  },
  {
    slug: "manufacturing",
    name_en: "Manufacturing and crafts",
    name_bn: "উৎপাদন ও হস্তশিল্প",
    icon: "factory",
  },
  {
    slug: "retail",
    name_en: "Retail and trade",
    name_bn: "খুচরা ও ব্যবসা-বাণিজ্য",
    icon: "storefront",
  },
  {
    slug: "education",
    name_en: "Education and training",
    name_bn: "শিক্ষা ও প্রশিক্ষণ",
    icon: "school",
  },
  {
    slug: "food",
    name_en: "Food and catering",
    name_bn: "খাবার ও ক্যাটারিং",
    icon: "restaurant",
  },
  { slug: "services", name_en: "Services", name_bn: "সেবা", icon: "handshake" },
  {
    slug: "construction",
    name_en: "Construction",
    name_bn: "নির্মাণ",
    icon: "construction",
  },
  {
    slug: "creative",
    name_en: "Creative and media",
    name_bn: "সৃজনশীল ও মিডিয়া",
    icon: "palette",
  },
  {
    slug: "tourism",
    name_en: "Tourism and hospitality",
    name_bn: "পর্যটন ও আতিথেয়তা",
    icon: "travel",
  },
  {
    slug: "logistics",
    name_en: "Transport and logistics",
    name_bn: "পরিবহন ও লজিস্টিকস",
    icon: "local_shipping",
  },
] as const;

export interface ReferenceDataReport {
  created: {
    categories: number;
    skills: number;
    locations: number;
    businessCategories: number;
  };
  existing: {
    categories: number;
    skills: number;
    locations: number;
    businessCategories: number;
  };
  /** W1: areas given their reference centre (only ones that had none). */
  centresSet: number;
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
    created: { categories: 0, skills: 0, locations: 0, businessCategories: 0 },
    existing: { categories: 0, skills: 0, locations: 0, businessCategories: 0 },
    centresSet: 0,
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
  report.centresSet = write
    ? await fillAreaCentres(prisma)
    : await fillAreaCentres(prisma, { dryRun: true });

  for (const [sort_order, sector] of businessCategories.entries()) {
    const found = await prisma.businessCategory.findUnique({
      where: { slug: sector.slug },
      select: { id: true },
    });
    if (found) {
      report.existing.businessCategories += 1;
      continue;
    }
    report.created.businessCategories += 1;
    if (write)
      await prisma.businessCategory.create({ data: { ...sector, sort_order } });
  }

  return report;
}
