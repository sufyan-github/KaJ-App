import {
  ApplicationStatus,
  JobActorType,
  JobStatus,
  JobType,
  PaymentModel,
  PrismaClient,
  RoleMode,
  SkillLevel,
  TrustLevel,
  UrgencyLevel,
} from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_ACCOUNTS = {
  customer: { phone: "+8801700000101", name: "সাবিনা রহমান" },
  business: { phone: "+8801700000102", name: "রাজশাহী সেবা কেন্দ্র" },
  worker: { phone: "+8801700000201", name: "আরিফ হোসেন" },
  applicant: { phone: "+8801700000202", name: "নুসরাত জাহান" },
} as const;

const jobs = [
  {
    id: "d0000000-0000-4000-8000-000000000001",
    poster: "customer",
    title: "অষ্টম শ্রেণির গণিত ও ইংরেজি গৃহশিক্ষক",
    description:
      "অষ্টম শ্রেণির একজন শিক্ষার্থীকে সপ্তাহে ৪ দিন গণিত ও ইংরেজি পড়াতে হবে। বিকেল ৫টা থেকে ৭টা, প্রতিটি ক্লাস ২ ঘণ্টা। অভিজ্ঞ, সময়নিষ্ঠ এবং পরিষ্কারভাবে বুঝিয়ে পড়াতে পারেন—এমন শিক্ষক অগ্রাধিকার পাবেন। বই ও পড়ার স্থান বাসায় দেওয়া হবে।",
    category: "education",
    skillSlugs: ["tutoring", "english-language"],
    location: "Uposhohor",
    areaLabel: "উপশহর নিউমার্কেটের কাছে, রাজশাহী",
    jobType: JobType.MONTHLY_PART_TIME,
    paymentModel: PaymentModel.MONTHLY,
    budgetMin: 600_000n,
    budgetMax: 800_000n,
    startDays: 2,
    startTime: "17:00",
    endTime: "19:00",
    workers: 1,
    urgency: UrgencyLevel.NORMAL,
  },
  {
    id: "d0000000-0000-4000-8000-000000000002",
    poster: "customer",
    title: "তিন কক্ষের বাসা গভীরভাবে পরিষ্কার",
    description:
      "তিনটি কক্ষ, রান্নাঘর ও দুইটি বাথরুম সম্পূর্ণ পরিষ্কার করতে হবে। মেঝে মোছা, জানালা পরিষ্কার, রান্নাঘরের তেলচিটে অংশ এবং বাথরুম ধোয়া কাজের অন্তর্ভুক্ত। প্রয়োজনীয় ক্লিনিং সামগ্রী বাসায় থাকবে। দুইজন অভিজ্ঞ কর্মী প্রয়োজন।",
    category: "home-services",
    skillSlugs: ["cleaning"],
    location: "Padma R/A",
    areaLabel: "পদ্মা আবাসিক এলাকা, ৩ নম্বর সড়ক",
    jobType: JobType.ONE_TIME,
    paymentModel: PaymentModel.FIXED,
    budgetMin: 180_000n,
    budgetMax: 240_000n,
    startDays: 3,
    startTime: "09:00",
    endTime: "14:00",
    workers: 2,
    urgency: UrgencyLevel.FLEXIBLE,
  },
  {
    id: "d0000000-0000-4000-8000-000000000003",
    poster: "business",
    title: "সাহেব বাজার থেকে রুয়েটে পার্সেল ডেলিভারি",
    description:
      "সাহেব বাজারের দোকান থেকে ছোট ইলেকট্রনিক পার্সেল সংগ্রহ করে রুয়েট গেটে পৌঁছে দিতে হবে। পার্সেলের ওজন আনুমানিক ৩ কেজি। মোটরসাইকেল বা সাইকেল থাকতে হবে, রসিদ ও ডেলিভারি ছবি অ্যাপে জমা দিতে হবে। ভাড়া ও জ্বালানি পারিশ্রমিকের অন্তর্ভুক্ত।",
    category: "transport-delivery",
    skillSlugs: ["delivery", "driving"],
    location: "Shaheb Bazar",
    areaLabel: "সাহেব বাজার জিরো পয়েন্ট থেকে সংগ্রহ",
    jobType: JobType.ONE_TIME,
    paymentModel: PaymentModel.FIXED,
    budgetMin: 35_000n,
    budgetMax: 50_000n,
    startDays: 1,
    startTime: "11:00",
    endTime: "13:00",
    workers: 1,
    urgency: UrgencyLevel.URGENT,
  },
  {
    id: "d0000000-0000-4000-8000-000000000004",
    poster: "customer",
    title: "দুটি সিলিং ফ্যান স্থাপন ও তার পরীক্ষা",
    description:
      "নতুন দুটি সিলিং ফ্যান লাগাতে হবে এবং বিদ্যমান সুইচ ও বৈদ্যুতিক তার নিরাপদ আছে কি না পরীক্ষা করতে হবে। মই বাসায় আছে, তবে কর্মীকে নিজস্ব সাধারণ ইলেকট্রিক টুলস আনতে হবে। কাজ শেষে উভয় ফ্যান চালিয়ে পরীক্ষা করতে হবে।",
    category: "construction-trades",
    skillSlugs: ["electrical-work"],
    location: "Talaimari",
    areaLabel: "তালাইমারী মোড়ের কাছে",
    jobType: JobType.HOURLY,
    paymentModel: PaymentModel.HOURLY,
    budgetMin: 50_000n,
    budgetMax: 70_000n,
    startDays: 4,
    startTime: "10:00",
    endTime: "13:00",
    workers: 1,
    urgency: UrgencyLevel.NORMAL,
  },
  {
    id: "d0000000-0000-4000-8000-000000000005",
    poster: "customer",
    title: "বয়স্ক ব্যক্তির দৈনিক সঙ্গ ও ওষুধ মনে করানো",
    description:
      "৭২ বছর বয়সী একজন ব্যক্তির সঙ্গে প্রতিদিন সকাল ৮টা থেকে দুপুর ১টা পর্যন্ত থাকতে হবে। সময়মতো ওষুধ মনে করানো, হালকা হাঁটায় সহায়তা এবং খাবার গরম করে দেওয়া কাজের অংশ। কোনো চিকিৎসা পদ্ধতি সম্পাদন করতে হবে না। পরিচয় যাচাইকৃত ও সহানুভূতিশীল কর্মী চাই।",
    category: "care-support",
    skillSlugs: ["elderly-care"],
    location: "Laxmipur",
    areaLabel: "লক্ষ্মীপুর মোড়, মেডিকেল কলেজের পাশে",
    jobType: JobType.DAILY,
    paymentModel: PaymentModel.DAILY,
    budgetMin: 80_000n,
    budgetMax: 100_000n,
    startDays: 2,
    startTime: "08:00",
    endTime: "13:00",
    workers: 1,
    urgency: UrgencyLevel.NORMAL,
  },
  {
    id: "d0000000-0000-4000-8000-000000000006",
    poster: "business",
    title: "বিয়ের অনুষ্ঠানের স্টেজ ও অতিথি এলাকা প্রস্তুতি",
    description:
      "কমিউনিটি সেন্টারে বিয়ের অনুষ্ঠানের জন্য চেয়ার-টেবিল সাজানো, হালকা স্টেজ উপকরণ বসানো এবং অতিথি প্রবেশপথ প্রস্তুত করতে হবে। টিম লিডারের নির্দেশনা অনুযায়ী ৪ জন কর্মী ৬ ঘণ্টা কাজ করবেন। খাবার ও নিরাপত্তা সরঞ্জাম আয়োজক দেবে।",
    category: "events-hospitality",
    skillSlugs: ["event-setup", "food-service"],
    location: "Court",
    areaLabel: "রাজপাড়া কমিউনিটি সেন্টার",
    jobType: JobType.ONE_TIME,
    paymentModel: PaymentModel.DAILY,
    budgetMin: 90_000n,
    budgetMax: 120_000n,
    startDays: 5,
    startTime: "10:00",
    endTime: "16:00",
    workers: 4,
    urgency: UrgencyLevel.NORMAL,
  },
  {
    id: "d0000000-0000-4000-8000-000000000007",
    poster: "business",
    title: "দোকানের পণ্যের তথ্য বাংলা ও ইংরেজিতে এন্ট্রি",
    description:
      "প্রায় ৪৫০টি পণ্যের নাম, মূল্য, স্টক ও সংক্ষিপ্ত বিবরণ নির্ধারিত স্প্রেডশিটে লিখতে হবে। বাংলা ও ইংরেজি টাইপিং জানতে হবে এবং তথ্য জমা দেওয়ার আগে ভুল যাচাই করতে হবে। নিজস্ব ল্যাপটপ থাকলে অগ্রাধিকার; অফিসে ইন্টারনেট দেওয়া হবে।",
    category: "digital-business",
    skillSlugs: ["data-entry"],
    location: "Kazla",
    areaLabel: "কাজলা গেট সংলগ্ন অফিস",
    jobType: JobType.PROJECT,
    paymentModel: PaymentModel.FIXED,
    budgetMin: 250_000n,
    budgetMax: 350_000n,
    startDays: 3,
    startTime: "09:30",
    endTime: "17:30",
    workers: 2,
    urgency: UrgencyLevel.FLEXIBLE,
  },
  {
    id: "d0000000-0000-4000-8000-000000000008",
    poster: "customer",
    title: "বাসা বদলের আসবাব ও কার্টন নিচে নামানো",
    description:
      "দ্বিতীয় তলার বাসা থেকে একটি খাট, ছোট আলমারি, টেবিল এবং আনুমানিক ১৫টি কার্টন নিচে নামিয়ে ট্রাকে তুলতে হবে। ভারী জিনিস নিরাপদে বহনের অভিজ্ঞতা থাকা জরুরি। ট্রাক ও দড়ি প্রস্তুত থাকবে; তিনজন কর্মী প্রয়োজন।",
    category: "general-labour",
    skillSlugs: ["moving", "lifting"],
    location: "Binodpur",
    areaLabel: "বিনোদপুর বাজারের পেছনে",
    jobType: JobType.ONE_TIME,
    paymentModel: PaymentModel.FIXED,
    budgetMin: 150_000n,
    budgetMax: 210_000n,
    startDays: 6,
    startTime: "07:30",
    endTime: "11:30",
    workers: 3,
    urgency: UrgencyLevel.FLEXIBLE,
  },
] as const;

type DemoAccountKey = keyof typeof DEMO_ACCOUNTS;

function dhakaFuture(days: number, time: string): Date {
  const now = new Date();
  const dhaka = new Date(now.getTime() + 6 * 3_600_000);
  const day = new Date(
    Date.UTC(
      dhaka.getUTCFullYear(),
      dhaka.getUTCMonth(),
      dhaka.getUTCDate() + days,
    ),
  );
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return new Date(day.getTime() + (hours - 6) * 3_600_000 + minutes * 60_000);
}

function clockTime(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return new Date(Date.UTC(1970, 0, 1, hours, minutes));
}

async function demoUser(
  key: DemoAccountKey,
  roles: RoleMode[],
  activeRole: RoleMode,
) {
  const account = DEMO_ACCOUNTS[key];
  const user = await prisma.user.upsert({
    where: { phone_e164: account.phone },
    update: { status: "ACTIVE", role_modes: roles, active_role: activeRole },
    create: {
      phone_e164: account.phone,
      status: "ACTIVE",
      role_modes: roles,
      active_role: activeRole,
    },
  });
  await prisma.profile.upsert({
    where: { user_id: user.id },
    update: {
      display_name: account.name,
      trust_level:
        key === "business" ? TrustLevel.BUSINESS : TrustLevel.IDENTITY,
      bio:
        activeRole === RoleMode.WORKER
          ? "রাজশাহী শহরে সময়মতো ও দায়িত্ব নিয়ে কাজ করি।"
          : "KAAJ-এর যাচাইকৃত ডেমো কাজদাতা।",
    },
    create: {
      user_id: user.id,
      display_name: account.name,
      trust_level:
        key === "business" ? TrustLevel.BUSINESS : TrustLevel.IDENTITY,
      bio:
        activeRole === RoleMode.WORKER
          ? "রাজশাহী শহরে সময়মতো ও দায়িত্ব নিয়ে কাজ করি।"
          : "KAAJ-এর যাচাইকৃত ডেমো কাজদাতা।",
    },
  });
  return user;
}

async function seedDemo() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo data cannot be seeded in production.");
  }

  const [customer, business, worker, applicant] = await Promise.all([
    demoUser("customer", [RoleMode.CUSTOMER], RoleMode.CUSTOMER),
    demoUser(
      "business",
      [RoleMode.CUSTOMER, RoleMode.BUSINESS],
      RoleMode.BUSINESS,
    ),
    demoUser("worker", [RoleMode.WORKER], RoleMode.WORKER),
    demoUser("applicant", [RoleMode.WORKER], RoleMode.WORKER),
  ]);
  const users = { customer, business, worker, applicant };

  await Promise.all([
    prisma.customerProfile.upsert({
      where: { user_id: customer.id },
      update: { jobs_posted_count: 5, payment_reliability_bps: 9800 },
      create: {
        user_id: customer.id,
        jobs_posted_count: 5,
        payment_reliability_bps: 9800,
      },
    }),
    prisma.customerProfile.upsert({
      where: { user_id: business.id },
      update: { jobs_posted_count: 3, payment_reliability_bps: 9900 },
      create: {
        user_id: business.id,
        jobs_posted_count: 3,
        payment_reliability_bps: 9900,
      },
    }),
    ...[worker, applicant].map((user, index) =>
      prisma.workerProfile.upsert({
        where: { user_id: user.id },
        update: {
          headline:
            index === 0 ? "বিশ্বস্ত বহুমুখী কর্মী" : "গৃহশিক্ষক ও ডেটা সহায়ক",
          experience_years: index === 0 ? 4 : 3,
          is_available_now: true,
          rating_avg: index === 0 ? 4.8 : 4.7,
          rating_count: index === 0 ? 18 : 12,
          completion_rate_bps: 9600,
          response_rate_bps: 9400,
          reliability_score: 0.95,
        },
        create: {
          user_id: user.id,
          headline:
            index === 0 ? "বিশ্বস্ত বহুমুখী কর্মী" : "গৃহশিক্ষক ও ডেটা সহায়ক",
          experience_years: index === 0 ? 4 : 3,
          is_available_now: true,
          rating_avg: index === 0 ? 4.8 : 4.7,
          rating_count: index === 0 ? 18 : 12,
          completion_rate_bps: 9600,
          response_rate_bps: 9400,
          reliability_score: 0.95,
        },
      }),
    ),
  ]);

  const allSkills = await prisma.skill.findMany();
  const skillBySlug = new Map(allSkills.map((skill) => [skill.slug, skill]));
  const areas = await prisma.location.findMany({ where: { type: "AREA" } });
  const areaByName = new Map(areas.map((area) => [area.name_en, area]));
  const categoryRows = await prisma.category.findMany({
    where: { parent_id: null },
  });
  const categoryBySlug = new Map(
    categoryRows.map((category) => [category.slug, category]),
  );

  for (const [index, item] of jobs.entries()) {
    const category = categoryBySlug.get(item.category);
    const location = areaByName.get(item.location);
    if (!category || !location) {
      throw new Error(
        `Run the main seed before demo seed: ${item.category}/${item.location}`,
      );
    }
    const startsAt = dhakaFuture(item.startDays, item.startTime);
    const endsAt = dhakaFuture(item.startDays, item.endTime);
    const poster = users[item.poster];
    await prisma.job.upsert({
      where: { id: item.id },
      update: {
        poster_user_id: poster.id,
        title: item.title,
        description: item.description,
        category_id: category.id,
        location_id: location.id,
        area_label: item.areaLabel,
        job_type: item.jobType,
        payment_model: item.paymentModel,
        budget_min_poisha: item.budgetMin,
        budget_max_poisha: item.budgetMax,
        is_negotiable: true,
        starts_at: startsAt,
        ends_at: endsAt,
        workers_required: item.workers,
        workers_filled: 0,
        urgency: item.urgency,
        status: JobStatus.APPLICATIONS_OPEN,
        published_at: new Date(),
        expires_at: startsAt,
        deleted_at: null,
        applications_count: index < 3 ? 1 : 0,
        is_featured: index < 2,
      },
      create: {
        id: item.id,
        poster_user_id: poster.id,
        title: item.title,
        description: item.description,
        category_id: category.id,
        location_id: location.id,
        area_label: item.areaLabel,
        job_type: item.jobType,
        payment_model: item.paymentModel,
        budget_min_poisha: item.budgetMin,
        budget_max_poisha: item.budgetMax,
        is_negotiable: true,
        starts_at: startsAt,
        ends_at: endsAt,
        workers_required: item.workers,
        urgency: item.urgency,
        status: JobStatus.APPLICATIONS_OPEN,
        published_at: new Date(),
        expires_at: startsAt,
        applications_count: index < 3 ? 1 : 0,
        is_featured: index < 2,
      },
    });
    await prisma.$transaction([
      prisma.jobSkill.deleteMany({ where: { job_id: item.id } }),
      prisma.jobSchedule.deleteMany({ where: { job_id: item.id } }),
      prisma.jobStatusHistory.deleteMany({ where: { job_id: item.id } }),
    ]);
    await prisma.jobSkill.createMany({
      data: item.skillSlugs.map((slug) => {
        const skill = skillBySlug.get(slug);
        if (!skill) throw new Error(`Missing skill: ${slug}`);
        return { job_id: item.id, skill_id: skill.id };
      }),
    });
    await prisma.jobSchedule.create({
      data: {
        job_id: item.id,
        date: startsAt,
        start_time: clockTime(item.startTime),
        end_time: clockTime(item.endTime),
      },
    });
    await prisma.jobStatusHistory.createMany({
      data: [
        {
          job_id: item.id,
          to_status: JobStatus.DRAFT,
          actor_user_id: poster.id,
          actor_type: JobActorType.POSTER,
        },
        {
          job_id: item.id,
          from_status: JobStatus.DRAFT,
          to_status: JobStatus.PUBLISHED,
          actor_user_id: poster.id,
          actor_type: JobActorType.POSTER,
        },
        {
          job_id: item.id,
          from_status: JobStatus.PUBLISHED,
          to_status: JobStatus.APPLICATIONS_OPEN,
          actor_type: JobActorType.SYSTEM,
        },
      ],
    });
  }

  const applicantSkills = ["tutoring", "english-language", "data-entry"];
  for (const slug of applicantSkills) {
    const skill = skillBySlug.get(slug);
    if (!skill) continue;
    await prisma.userSkill.upsert({
      where: {
        user_id_skill_id: { user_id: applicant.id, skill_id: skill.id },
      },
      update: { level: SkillLevel.ADVANCED, years: 3, is_verified: true },
      create: {
        user_id: applicant.id,
        skill_id: skill.id,
        level: SkillLevel.ADVANCED,
        years: 3,
        is_verified: true,
        verified_at: new Date(),
      },
    });
  }
  await prisma.availabilityRule.deleteMany({
    where: { user_id: { in: [worker.id, applicant.id] } },
  });
  await prisma.availabilityRule.createMany({
    data: [worker.id, applicant.id].flatMap((userId) =>
      [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        user_id: userId,
        day_of_week: day,
        start_time: clockTime("07:00"),
        end_time: clockTime("21:00"),
      })),
    ),
  });

  for (const item of jobs.slice(0, 3)) {
    await prisma.application.upsert({
      where: {
        job_id_worker_user_id: {
          job_id: item.id,
          worker_user_id: applicant.id,
        },
      },
      update: {
        status: ApplicationStatus.PENDING,
        message:
          "আমি এই কাজের সময় ও দায়িত্ব বুঝেছি এবং নির্ধারিত সময়ে কাজ করতে পারব।",
        proposed_price_poisha: item.budgetMin,
        proposed_starts_at: dhakaFuture(item.startDays, item.startTime),
        proposed_ends_at: dhakaFuture(item.startDays, item.endTime),
        responded_at: null,
      },
      create: {
        job_id: item.id,
        worker_user_id: applicant.id,
        status: ApplicationStatus.PENDING,
        message:
          "আমি এই কাজের সময় ও দায়িত্ব বুঝেছি এবং নির্ধারিত সময়ে কাজ করতে পারব।",
        proposed_price_poisha: item.budgetMin,
        proposed_starts_at: dhakaFuture(item.startDays, item.startTime),
        proposed_ends_at: dhakaFuture(item.startDays, item.endTime),
      },
    });
  }

  console.log(`KAAJ demo data ready: ${jobs.length} jobs, 4 accounts.`);
  console.log(
    "Demo OTP: use the locally configured fixed OTP (currently 123456). ",
  );
}

seedDemo()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
