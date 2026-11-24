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
      summaryEn:
        "You will learn: one thing.\nStep 1: Do it.\nRemember: be careful.",
      summaryBn:
        "আপনি শিখবেন: একটি বিষয়।\nধাপ ১: করুন।\nমনে রাখুন: সাবধান থাকুন।",
      youtubeVideoId: null,
      durationS: 120,
      isSafety: isSafetyCritical,
    },
  ],
  questions: ["b", "c"].map((correct, index) => ({
    promptEn: `Question ${index + 1}?`,
    promptBn: `প্রশ্ন ${index + 1}?`,
    options: ["a", "b", "c", "d"].map((id) => ({
      id,
      en: `Option ${id}`,
      bn: `বিকল্প ${id}`,
    })),
    correctOptionId: correct,
    explanationEn: "Because.",
    explanationBn: "কারণ।",
  })),
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

  const founderOptions = async (
    extra: Partial<LaunchContentOptions> = {},
  ): Promise<LaunchContentOptions> => {
    const founder = await api.actor([RoleMode.BUSINESS], {
      trust: TrustLevel.IDENTITY,
    });
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: founder.id },
    });
    return { founderPhone: row.phone_e164!, production: false, ...extra };
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

  it("refuses to load without an existing founder, and never invents one in production", async () => {
    const missing = phone();
    await expect(
      loadLaunchContent(prisma, content(), {
        founderPhone: missing,
        production: false,
      }),
    ).rejects.toThrow(/must sign up in the app first/u);
    await expect(
      loadLaunchContent(prisma, content(), {
        founderPhone: missing,
        createFounder: true,
        production: true,
      }),
    ).rejects.toThrow(/refused in production/u);
    await expect(
      loadLaunchContent(prisma, content(), {
        founderPhone: undefined,
        production: false,
      }),
    ).rejects.toBeInstanceOf(LaunchContentError);
    expect(await prisma.user.count({ where: { phone_e164: missing } })).toBe(0);
    expect(
      await prisma.businessIdea.count({
        where: { seed_key: { startsWith: `t-${tag}` } },
      }),
    ).toBe(0);
  });

  it("creates a local founder with --create-founder outside production", async () => {
    const local = phone();
    const result = await loadLaunchContent(prisma, content(), {
      founderPhone: local,
      founderName: "Local Founder",
      createFounder: true,
      production: false,
    });
    expect(result.founder.created).toBe(true);
    const profile = await prisma.profile.findUniqueOrThrow({
      where: { user_id: result.founder.userId },
    });
    expect(profile.display_name).toBe("Local Founder");
  });

  it("loads ideas, groups and courses once, and a re-run duplicates nothing", async () => {
    const options = await founderOptions();
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
    expect(idea.owner_user_id).toBe(first.founder.userId);
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
        user_id: first.founder.userId,
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
    const options = await founderOptions();
    const held = await loadLaunchContent(prisma, content(), options);
    expect(held.groups.held).toEqual([
      { key: `t-${tag}-women`, reason: expect.stringContaining("held") },
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
    const options = await founderOptions();
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
    const options = await founderOptions();
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
