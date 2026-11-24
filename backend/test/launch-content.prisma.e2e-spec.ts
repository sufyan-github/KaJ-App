import { randomInt, randomUUID } from "node:crypto";
import {
  Gender,
  GroupMemberRole,
  IdeaArrangement,
  IdeaRoleStatus,
  PrismaClient,
  RoleMode,
  TrustLevel,
} from "@prisma/client";

import {
  LaunchContentError,
  LaunchContentOptions,
  loadLaunchContent,
  parseLaunchCourseFile,
} from "../src/modules/launch-content/launch-content.loader";
import { HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const phone = () =>
  `+88017${String(randomInt(0, 99_999_999)).padStart(8, "0")}`;

const course = (slug: string, isSafetyCritical: boolean) => ({
  slug,
  skillSlug: null,
  titleEn: "Test course",
  titleBn: "পরীক্ষার কোর্স",
  summaryEn: "A short test course.",
  summaryBn: "একটি ছোট পরীক্ষার কোর্স।",
  minutes: 10,
  estDataMb: 1,
  passMarkPct: 70,
  questionCount: 2,
  isSafetyCritical,
  sortOrder: 900,
  lessons: [
    {
      titleEn: "Lesson one",
      titleBn: "পাঠ এক",
      summaryEn: `You will learn: one thing.\n${isSafetyCritical ? "Hazard: it can hurt; stop and call a qualified person." : "Step 1: Do it."}\nRemember: be careful.`,
      summaryBn: `আপনি শিখবেন: একটি বিষয়।\n${isSafetyCritical ? "ঝুঁকি: আঘাত লাগতে পারে; থামুন ও দক্ষ কাউকে ডাকুন।" : "ধাপ ১: করুন।"}\nমনে রাখুন: সাবধান থাকুন।`,
      youtubeVideoId: null,
      durationS: 120,
      isSafety: isSafetyCritical,
    },
  ],
  // Two checkpoint questions, then extras: at least 12 in all.
  questions: ["b", "c", "a", "d", "b", "c", "a", "d", "b", "c", "a", "d"].map(
    (correct, index) => ({
      promptEn: `Question ${index + 1}?`,
      promptBn: `প্রশ্ন ${index + 1}?`,
      options: ["a", "b", "c", "d"].map((id) => ({
        id,
        en: `Option ${id}`,
        bn: `বিকল্প ${id}`,
      })),
      correctOptionId: correct,
      // The first two are lesson 1's checkpoint.
      lesson: index < 2 ? 1 : null,
      explanationEn: "Because.",
      explanationBn: "কারণ।",
    }),
  ),
});

/** R7 launch content: `pnpm seed:launch` against a real database. */
databaseDescribe("launch content loader (PostgreSQL)", () => {
  let api: HttpHarness;
  let prisma: PrismaClient;
  let tag: string;

  const content = (overrides: { ideaTitle?: string; roles?: number } = {}) => ({
    ideasAndGroups: {
      _note: "Review note, not loaded.",
      ideas: [
        {
          key: `t-${tag}-idea`,
          en: "Review-only title",
          title: overrides.ideaTitle ?? "পরীক্ষার আইডিয়া",
          category: "food",
          area: "Shaheb Bazar",
          stage: "CONCEPT",
          visibility: "SUMMARY_PUBLIC",
          summary: "একটি পরীক্ষার আইডিয়ার সংক্ষিপ্ত বিবরণ।",
          problem: "পরীক্ষার জন্য একটি সমস্যা।",
          solution: "পরীক্ষার জন্য একটি সমাধান।",
          details: "আরও বিস্তারিত।",
          roles: [
            {
              type: "OPERATIONS",
              title: "সমন্বয়কারী",
              description: "কাজ সমন্বয় করা।",
              time: "PART_TIME",
            },
            {
              type: "MARKETING",
              title: "প্রচার",
              description: "প্রচার চালানো।",
              time: "FLEXIBLE",
            },
          ].slice(0, overrides.roles ?? 2),
        },
        {
          key: `t-${tag}-call`,
          partnerCall: true,
          title: "অংশীদার খোঁজা হচ্ছে",
          category: "services",
          area: "Padma R/A",
          stage: "VALIDATING",
          visibility: "SUMMARY_PUBLIC",
          summary: "একজন অংশীদারের জন্য আহ্বান, পরীক্ষা।",
          problem: "পরীক্ষার জন্য একটি সমস্যা।",
          solution: "পরীক্ষার জন্য একটি সমাধান।",
          roles: [
            {
              type: "DISTRIBUTION",
              title: "এলাকা প্রতিনিধি",
              description: "এলাকায় কাজ করা।",
              time: "PART_TIME",
            },
          ],
        },
      ],
      groups: [
        {
          key: `t-${tag}-group`,
          en: "Review",
          name: "পরীক্ষার দল",
          description: "একটি পরীক্ষার দল।",
          visibility: "PUBLIC",
          womenOnly: false,
          jobCategory: "construction-trades",
        },
        {
          key: `t-${tag}-women`,
          name: "নারী উদ্যোক্তা পরীক্ষা",
          description: "নারীদের জন্য।",
          visibility: "PUBLIC",
          womenOnly: true,
          holdUntilModerator: true,
        },
      ],
    },
    courses: [
      {
        fileName: `t-${tag}-basic.json`,
        content: { courses: [course(`t-${tag}-basic`, false)] },
      },
      {
        fileName: `t-${tag}-safety.json`,
        content: { courses: [course(`t-${tag}-safety`, true)] },
      },
    ],
  });

  /** An admin owner (not identity-verified), as on a real launch. */
  const makeAdmin = async (profile?: { display_name: string }) => {
    const email = `owner-${randomUUID().slice(0, 8)}@kaj.test`;
    const user = await prisma.user.create({
      data: {
        phone_e164: phone(),
        email,
        is_admin: true,
        status: "ACTIVE",
        role_modes: [RoleMode.CUSTOMER, RoleMode.WORKER, RoleMode.BUSINESS],
        active_role: RoleMode.CUSTOMER,
        ...(profile ? { profile: { create: profile } } : {}),
      },
    });
    return { id: user.id, email };
  };
  const ownerOptions = async (
    extra: Partial<LaunchContentOptions> = {},
  ): Promise<LaunchContentOptions & { ownerId: string }> => {
    const admin = await makeAdmin();
    return {
      ownerEmail: admin.email.toUpperCase(),
      ownerId: admin.id,
      ...extra,
    };
  };

  beforeEach(() => {
    tag = randomUUID().slice(0, 8);
  });

  beforeAll(async () => {
    api = await HttpHarness.start();
    prisma = api.db as unknown as PrismaClient;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("refuses to load without exactly one matching admin, and never creates one", async () => {
    const before = await prisma.user.count();
    await expect(
      loadLaunchContent(prisma, content(), {
        ownerEmail: `nobody-${tag}@kaj.test`,
      }),
    ).rejects.toThrow(/No admin account has the email/u);
    // A non-admin with that email is not the owner.
    const plain = await api.actor([RoleMode.CUSTOMER]);
    await prisma.user.update({
      where: { id: plain.id },
      data: { email: `plain-${tag}@kaj.test` },
    });
    await expect(
      loadLaunchContent(prisma, content(), {
        ownerEmail: `plain-${tag}@kaj.test`,
      }),
    ).rejects.toThrow(/No admin account has the email/u);
    // The seed email is the fallback; with no email, two admins are ambiguous.
    await expect(
      loadLaunchContent(prisma, content(), {
        adminSeedEmail: `seed-${tag}@kaj.test`,
      }),
    ).rejects.toThrow(/ADMIN_SEED_EMAIL/u);
    await makeAdmin();
    await makeAdmin();
    await expect(loadLaunchContent(prisma, content(), {})).rejects.toThrow(
      /More than one admin account/u,
    );
    await expect(
      loadLaunchContent(prisma, content(), {
        ownerEmail: `nobody-${tag}@kaj.test`,
      }),
    ).rejects.toBeInstanceOf(LaunchContentError);
    expect(await prisma.user.count()).toBe(before + 3);
    expect(
      await prisma.businessIdea.count({
        where: { seed_key: { startsWith: `t-${tag}` } },
      }),
    ).toBe(0);
  });

  it("names the owner KAAJ, shows it in full and places it, without changing trust", async () => {
    const bare = await makeAdmin();
    const result = await loadLaunchContent(prisma, content(), {
      ownerEmail: bare.email,
    });
    expect(result.owner).toMatchObject({
      userId: bare.id,
      profileUpdated: true,
    });
    const profile = await prisma.profile.findUniqueOrThrow({
      where: { user_id: bare.id },
      include: { primary_location: true },
    });
    expect(profile).toMatchObject({
      display_name: "KAAJ",
      show_full_name: true,
      trust_level: TrustLevel.NONE,
    });
    expect(profile.primary_location?.name_en).toBe("Shaheb Bazar");

    // An existing name stays unless LAUNCH_OWNER_NAME is set.
    tag = randomUUID().slice(0, 8);
    const named = await makeAdmin({ display_name: "Shirin Akter" });
    await loadLaunchContent(prisma, content(), { ownerEmail: named.email });
    const kept = await prisma.profile.findUniqueOrThrow({
      where: { user_id: named.id },
    });
    expect(kept).toMatchObject({
      display_name: "Shirin Akter",
      show_full_name: true,
    });
    tag = randomUUID().slice(0, 8);
    await loadLaunchContent(prisma, content(), {
      ownerEmail: named.email,
      ownerName: "KAAJ Team",
    });
    const renamed = await prisma.profile.findUniqueOrThrow({
      where: { user_id: named.id },
    });
    expect(renamed.display_name).toBe("KAAJ Team");
    expect(renamed.trust_level).toBe(kept.trust_level);
  });

  it("lets a reader ask for access, ask about a role and join a group of an unverified owner", async () => {
    const options = await ownerOptions();
    await loadLaunchContent(prisma, content(), options);
    const idea = await prisma.businessIdea.findUniqueOrThrow({
      where: { seed_key: `t-${tag}-idea` },
      include: { roles: { orderBy: { sort_order: "asc" } } },
    });
    const group = await prisma.communityGroup.findUniqueOrThrow({
      where: { seed_key: `t-${tag}-group` },
    });
    const reader = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.IDENTITY,
    });
    const listed = await api.get(`ideas/${idea.id}`, reader).expect(200);
    expect(JSON.stringify(listed.body.data)).toContain("KAAJ");
    await api
      .post(`ideas/${idea.id}/access-requests`, reader, {
        acceptConfidentiality: true,
        message: "I would like to read the details.",
      })
      .expect(201);
    const collaboration = await api
      .post("collaboration-requests", reader, {
        subjectType: "IDEA",
        subjectId: idea.id,
        ideaRoleId: idea.roles[0]!.id,
        message: "I can coordinate this part-time.",
      })
      .expect(201);
    await api.post(`community/groups/${group.id}/join`, reader).expect(201);

    // The owner can answer, unverified too.
    const owner = await api.tokenFor(options.ownerId, [RoleMode.BUSINESS]);
    await api
      .post(`ideas/${idea.id}/access-requests/${reader.id}/approve`, owner)
      .expect(201);
    await api
      .post(
        `collaboration-requests/${collaboration.body.data.id}/accept`,
        owner,
      )
      .expect(201);
  });

  it("loads ideas, groups and courses once, and a re-run duplicates nothing", async () => {
    const options = await ownerOptions();
    const first = await loadLaunchContent(prisma, content(), options);
    expect(first.ideas.created).toEqual([`t-${tag}-idea`, `t-${tag}-call`]);
    expect(first.groups.created).toEqual([`t-${tag}-group`]);
    expect(first.courses.created.sort()).toEqual(
      [`t-${tag}-basic`, `t-${tag}-safety`].sort(),
    );

    const idea = await prisma.businessIdea.findUniqueOrThrow({
      where: { seed_key: `t-${tag}-idea` },
      include: {
        roles: { orderBy: { sort_order: "asc" } },
        location: true,
        category: true,
      },
    });
    expect(idea.owner_user_id).toBe(options.ownerId);
    expect(idea.location?.name_en).toBe("Shaheb Bazar");
    expect(idea.category.slug).toBe("food");
    expect(idea.roles.map((role) => role.arrangement)).toEqual([
      IdeaArrangement.UNDECIDED,
      IdeaArrangement.UNDECIDED,
    ]);
    const group = await prisma.communityGroup.findUniqueOrThrow({
      where: { seed_key: `t-${tag}-group` },
      include: { members: true, category: true, location: true },
    });
    expect(group.category?.slug).toBe("construction-trades");
    expect(group.location?.name_en).toBe("Rajshahi");
    expect(group.members).toEqual([
      expect.objectContaining({
        user_id: options.ownerId,
        role: GroupMemberRole.MODERATOR,
        status: "ACTIVE",
      }),
    ]);

    const again = await loadLaunchContent(prisma, content(), options);
    expect(again.ideas.unchanged).toHaveLength(2);
    expect(again.groups.unchanged).toEqual([`t-${tag}-group`]);
    expect(again.courses.unchanged).toHaveLength(2);
    expect(
      await prisma.businessIdea.count({
        where: { seed_key: { startsWith: `t-${tag}` } },
      }),
    ).toBe(2);
    expect(await prisma.ideaRole.count({ where: { idea_id: idea.id } })).toBe(
      2,
    );

    // An edit updates in place; a role taken out of the content closes.
    const edited = await loadLaunchContent(
      prisma,
      content({ ideaTitle: "নতুন শিরোনাম", roles: 1 }),
      options,
    );
    expect(edited.ideas.updated).toEqual([`t-${tag}-idea`]);
    const roles = await prisma.ideaRole.findMany({
      where: { idea_id: idea.id },
      orderBy: { sort_order: "asc" },
    });
    expect(roles.map((role) => role.status)).toEqual([
      IdeaRoleStatus.OPEN,
      IdeaRoleStatus.CLOSED,
    ]);
  });

  it("holds the women-only group until a verified woman can moderate it", async () => {
    const options = await ownerOptions();
    const held = await loadLaunchContent(prisma, content(), options);
    expect(held.groups.held).toEqual([
      { key: `t-${tag}-women`, reason: expect.stringContaining("women-only") },
    ]);
    expect(
      await prisma.communityGroup.count({
        where: { seed_key: `t-${tag}-women` },
      }),
    ).toBe(0);

    const unverified = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.PHONE,
      profile: { gender: Gender.FEMALE },
    });
    const unverifiedPhone = (
      await prisma.user.findUniqueOrThrow({ where: { id: unverified.id } })
    ).phone_e164!;
    const stillHeld = await loadLaunchContent(prisma, content(), {
      ...options,
      womenModeratorPhone: unverifiedPhone,
    });
    expect(stillHeld.groups.held.map((item) => item.key)).toEqual([
      `t-${tag}-women`,
    ]);

    const woman = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.IDENTITY,
      profile: { gender: Gender.FEMALE },
    });
    const womanPhone = (
      await prisma.user.findUniqueOrThrow({ where: { id: woman.id } })
    ).phone_e164!;
    const loaded = await loadLaunchContent(prisma, content(), {
      ...options,
      womenModeratorPhone: womanPhone,
    });
    expect(loaded.groups.held).toEqual([]);
    expect(loaded.groups.created).toEqual([`t-${tag}-women`]);
    const group = await prisma.communityGroup.findUniqueOrThrow({
      where: { seed_key: `t-${tag}-women` },
      include: { members: true },
    });
    expect(group.women_only).toBe(true);
    expect(group.created_by_user_id).toBe(woman.id);
    expect(
      group.members.map((member) => [member.user_id, member.role]),
    ).toEqual([[woman.id, GroupMemberRole.MODERATOR]]);
  });

  it("publishes regular courses and keeps safety-critical ones unpublished unless asked", async () => {
    const options = await ownerOptions();
    const result = await loadLaunchContent(prisma, content(), options);
    expect(result.courses.heldUnpublished).toEqual([`t-${tag}-safety`]);
    const published = async (slug: string) =>
      (await prisma.trainingCourse.findUniqueOrThrow({ where: { slug } }))
        .is_published;
    expect(await published(`t-${tag}-basic`)).toBe(true);
    expect(await published(`t-${tag}-safety`)).toBe(false);

    const reviewed = await loadLaunchContent(prisma, content(), {
      ...options,
      publishSafety: true,
    });
    expect(reviewed.courses.heldUnpublished).toEqual([]);
    expect(await published(`t-${tag}-safety`)).toBe(true);
  });

  it("validates everything before writing anything", async () => {
    const options = await ownerOptions();
    const bad = content();
    bad.ideasAndGroups.ideas[0]!.area = "Nowhere Bazar";
    await expect(loadLaunchContent(prisma, bad, options)).rejects.toThrow(
      /area "Nowhere Bazar" matches 0/u,
    );
    const typo = content();
    (typo.ideasAndGroups.groups[0] as Record<string, unknown>).womenOnlyy =
      true;
    await expect(loadLaunchContent(prisma, typo, options)).rejects.toThrow();
    expect(
      await prisma.businessIdea.count({
        where: { seed_key: { startsWith: `t-${tag}` } },
      }),
    ).toBe(0);

    const lesson = course("mismatch", false);
    lesson.lessons[0]!.summaryBn = "আপনি শিখবেন: একটি বিষয়।";
    expect(() =>
      parseLaunchCourseFile("mismatch.json", { courses: [lesson] }),
    ).toThrow(/lesson 1 summaryEn has 3 lines, summaryBn 1/u);
    const unmarked = course("unmarked-hazard", true);
    unmarked.lessons[0]!.isSafety = false;
    expect(() =>
      parseLaunchCourseFile("unmarked-hazard.json", { courses: [unmarked] }),
    ).toThrow(/isSafety is false but it has "Hazard:" line/u);
    const few = course("few-questions", false);
    few.questions.splice(11);
    expect(() =>
      parseLaunchCourseFile("few-questions.json", { courses: [few] }),
    ).toThrow(/11 questions; needs at least 12/u);
    // Lesson steps: the first two questions are lesson 1's checkpoint.
    const unlinked = course("unlinked", false);
    unlinked.questions[1]!.lesson = null;
    expect(() =>
      parseLaunchCourseFile("unlinked.json", { courses: [unlinked] }),
    ).toThrow(/question 2 should have lesson 1/u);
    const mixed = course("mixed-kinds", false);
    mixed.lessons[0]!.summaryBn = mixed.lessons[0]!.summaryBn.replace(
      "মনে রাখুন:",
      "ধাপ ২:",
    );
    expect(() =>
      parseLaunchCourseFile("mixed-kinds.json", { courses: [mixed] }),
    ).toThrow(/line 3 is REMEMBER in English but STEP in Bangla/u);
    const options3 = course("three-options", false);
    options3.questions[0]!.options.pop();
    expect(() =>
      parseLaunchCourseFile("three-options.json", { courses: [options3] }),
    ).toThrow(/must be a, b, c, d/u);
    expect(() =>
      parseLaunchCourseFile("other-name.json", {
        courses: [course("real-slug", false)],
      }),
    ).toThrow(/file name must be the course slug/u);
  });
});
