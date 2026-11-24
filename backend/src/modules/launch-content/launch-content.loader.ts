import {
  Gender,
  GroupMemberRole,
  GroupMemberStatus,
  GroupVisibility,
  IdeaArrangement,
  IdeaRoleStatus,
  IdeaRoleType,
  IdeaStage,
  IdeaTimeCommitment,
  IdeaVisibility,
  LocationType,
  Prisma,
  PrismaClient,
  RoleMode,
  TrustLevel,
} from "@prisma/client";
import { z } from "zod";

import {
  loadTrainingContent,
  trainingContentSchema,
  type CourseContent,
} from "../training/content/training-content.loader";
import { hasTrust } from "../verification/trust-level";

/**
 * Launch content (`pnpm seed:launch`): the founder's approved ideas, partner
 * calls, community groups and courses. Idempotent: ideas and groups are
 * matched by `seed_key`, courses by slug, so a re-run updates and never
 * duplicates. Review-only fields (`_note`, `en`) are accepted and ignored.
 */

const text = (max: number, min = 1) => z.string().trim().min(min).max(max);
const key = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const roleSchema = z
  .object({
    type: z.nativeEnum(IdeaRoleType),
    title: text(80),
    description: text(500),
    time: z.nativeEnum(IdeaTimeCommitment),
  })
  .strict();

const ideaSchema = z
  .object({
    key,
    /** Review-only English title; not loaded. */
    en: z.string().optional(),
    /** A partner call is an idea at VALIDATING with one open role. */
    partnerCall: z.boolean().optional(),
    title: text(120, 3),
    summary: text(160, 10),
    problem: text(2000, 10),
    solution: text(2000, 10),
    details: text(5000).nullable().optional(),
    /** A business category slug. */
    category: key,
    /** An AREA, by its English name. */
    area: text(120),
    stage: z.enum([IdeaStage.CONCEPT, IdeaStage.VALIDATING, IdeaStage.PILOT]),
    visibility: z.nativeEnum(IdeaVisibility),
    roles: z.array(roleSchema).min(1).max(10),
  })
  .strict();

const groupSchema = z
  .object({
    key,
    en: z.string().optional(),
    name: text(80, 3),
    description: text(1000).optional(),
    visibility: z.nativeEnum(GroupVisibility),
    womenOnly: z.boolean().default(false),
    /** A work category slug. */
    jobCategory: key.nullable().optional(),
    /** An AREA by English name; the city when absent. */
    area: text(120).optional(),
    /** Held until a verified woman can moderate it. */
    holdUntilModerator: z.boolean().optional(),
  })
  .strict();

const unique = <T>(items: T[], pick: (item: T) => string) =>
  new Set(items.map(pick)).size === items.length;

export const ideasAndGroupsSchema = z
  .object({
    _note: z.string().optional(),
    ideas: z.array(ideaSchema),
    groups: z.array(groupSchema),
  })
  .strict()
  .refine((content) => unique(content.ideas, (idea) => idea.key), {
    message: "Idea keys must be unique.",
  })
  .refine((content) => unique(content.groups, (group) => group.key), {
    message: "Group keys must be unique.",
  });

export type IdeasAndGroups = z.infer<typeof ideasAndGroupsSchema>;
type IdeaContent = IdeasAndGroups["ideas"][number];
type GroupContent = IdeasAndGroups["groups"][number];

const OPTION_IDS = ["a", "b", "c", "d"];
const lines = (value: string) => value.split("\n").length;

/**
 * The launch course conventions on top of the loader schema: Bangla and
 * English summaries line up, four options a–d, a correct option.
 */
export function launchCourseIssues(course: CourseContent): string[] {
  const issues: string[] = [];
  if (lines(course.summaryEn) !== lines(course.summaryBn))
    issues.push(`${course.slug}: course summary line counts differ`);
  course.lessons.forEach((lesson, index) => {
    if (lines(lesson.summaryEn) !== lines(lesson.summaryBn))
      issues.push(
        `${course.slug}: lesson ${index + 1} summaryEn has ${lines(lesson.summaryEn)} lines, summaryBn ${lines(lesson.summaryBn)}`,
      );
  });
  course.questions.forEach((question, index) => {
    const ids = question.options.map((option) => option.id);
    if (JSON.stringify(ids) !== JSON.stringify(OPTION_IDS))
      issues.push(
        `${course.slug}: question ${index + 1} options must be a, b, c, d (got ${ids.join(",")})`,
      );
    if (!ids.includes(question.correctOptionId))
      issues.push(
        `${course.slug}: question ${index + 1} correctOptionId "${question.correctOptionId}" is not an option`,
      );
  });
  return issues;
}

/** Parses one `courses/<slug>.json` file: one course, named after its slug. */
export function parseLaunchCourseFile(
  fileName: string,
  raw: unknown,
): CourseContent {
  const content = trainingContentSchema.parse(raw);
  if (content.courses.length !== 1)
    throw new LaunchContentError(
      `${fileName}: a course file holds exactly one course (found ${content.courses.length}).`,
    );
  const course = content.courses[0]!;
  if (fileName.replace(/\.json$/u, "") !== course.slug)
    throw new LaunchContentError(
      `${fileName}: the file name must be the course slug (${course.slug}.json).`,
    );
  const issues = launchCourseIssues(course);
  if (issues.length > 0) throw new LaunchContentError(issues.join("\n"));
  return course;
}

export class LaunchContentError extends Error {}

export interface LaunchContentOptions {
  founderPhone: string | undefined;
  founderName?: string;
  /** Outside production only: create the founder as a local test user. */
  createFounder?: boolean;
  womenModeratorPhone?: string;
  /** Publish safety-critical courses (only after a trainer's review). */
  publishSafety?: boolean;
  production: boolean;
}

export interface LaunchContentInput {
  ideasAndGroups: unknown;
  courses: Array<{ fileName: string; content: unknown }>;
}

interface Tally {
  created: string[];
  updated: string[];
  unchanged: string[];
}

export interface LaunchContentResult {
  founder: { userId: string; created: boolean };
  ideas: Tally;
  groups: Tally & { held: Array<{ key: string; reason: string }> };
  courses: {
    created: string[];
    updated: string[];
    versionBumped: string[];
    unchanged: string[];
    /** Safety-critical courses left unpublished for a trainer's review. */
    heldUnpublished: string[];
  };
}

const E164 = /^\+[1-9]\d{7,14}$/u;
const tally = (): Tally => ({ created: [], updated: [], unchanged: [] });

/**
 * Validates everything first (nothing is written if any file is wrong),
 * then loads ideas, groups and courses.
 */
export async function loadLaunchContent(
  prisma: PrismaClient,
  input: LaunchContentInput,
  options: LaunchContentOptions,
): Promise<LaunchContentResult> {
  const content = ideasAndGroupsSchema.parse(input.ideasAndGroups);
  const courses = input.courses.map((file) =>
    parseLaunchCourseFile(file.fileName, file.content),
  );
  if (!unique(courses, (course) => course.slug))
    throw new LaunchContentError("Course slugs must be unique across files.");

  const founder = await resolveFounder(prisma, options);
  const refs = await resolveReferences(prisma, content);

  const ideas = tally();
  for (const idea of content.ideas) {
    const outcome = await prisma.$transaction((transaction) =>
      upsertIdea(transaction, idea, founder.userId, refs),
    );
    ideas[outcome].push(idea.key);
  }

  const groups = {
    ...tally(),
    held: [] as LaunchContentResult["groups"]["held"],
  };
  const womanModerator = await resolveWomanModerator(prisma, options);
  for (const group of content.groups) {
    const needsWoman = group.womenOnly || group.holdUntilModerator === true;
    if (needsWoman && !womanModerator.userId) {
      groups.held.push({ key: group.key, reason: womanModerator.reason });
      continue;
    }
    const ownerId = needsWoman ? womanModerator.userId! : founder.userId;
    const outcome = await prisma.$transaction((transaction) =>
      upsertGroup(transaction, group, ownerId, refs),
    );
    groups[outcome].push(group.key);
  }

  const safety = courses.filter((course) => course.isSafetyCritical);
  const regular = courses.filter((course) => !course.isSafetyCritical);
  const regularResult = await loadTrainingContent(
    prisma,
    { courses: regular },
    { publish: true },
  );
  const safetyResult = await loadTrainingContent(
    prisma,
    { courses: safety },
    { publish: options.publishSafety === true },
  );
  const stillHidden = await prisma.trainingCourse.findMany({
    where: {
      slug: { in: safety.map((course) => course.slug) },
      is_published: false,
    },
    select: { slug: true },
  });

  return {
    founder,
    ideas,
    groups,
    courses: {
      created: [...regularResult.created, ...safetyResult.created],
      updated: [...regularResult.updated, ...safetyResult.updated],
      versionBumped: [
        ...regularResult.versionBumped,
        ...safetyResult.versionBumped,
      ],
      unchanged: [...regularResult.unchanged, ...safetyResult.unchanged],
      heldUnpublished: stillHidden.map((course) => course.slug).sort(),
    },
  };
}

async function resolveFounder(
  prisma: PrismaClient,
  options: LaunchContentOptions,
): Promise<LaunchContentResult["founder"]> {
  const phone = options.founderPhone?.trim();
  if (!phone || !E164.test(phone))
    throw new LaunchContentError(
      "Set LAUNCH_FOUNDER_PHONE to the founder's phone in E.164 form, e.g. +8801XXXXXXXXX.",
    );
  const existing = await prisma.user.findUnique({
    where: { phone_e164: phone },
    select: { id: true, status: true, deleted_at: true },
  });
  if (existing) {
    if (existing.status !== "ACTIVE" || existing.deleted_at)
      throw new LaunchContentError(
        `The founder account ${phone} is not active (status ${existing.status}).`,
      );
    return { userId: existing.id, created: false };
  }
  if (!options.createFounder)
    throw new LaunchContentError(
      `No account has the phone ${phone} (LAUNCH_FOUNDER_PHONE). The founder must sign up in the app first; nothing was loaded.` +
        (options.production
          ? ""
          : " For a local test database you may pass --create-founder."),
    );
  if (options.production)
    throw new LaunchContentError(
      "--create-founder is refused in production: the founder signs up in the app.",
    );
  const created = await prisma.user.create({
    data: {
      phone_e164: phone,
      status: "ACTIVE",
      role_modes: [RoleMode.BUSINESS, RoleMode.CUSTOMER],
      active_role: RoleMode.BUSINESS,
      profile: {
        create: {
          display_name: options.founderName?.trim() || "KAAJ Founder",
          trust_level: TrustLevel.IDENTITY,
        },
      },
    },
    select: { id: true },
  });
  return { userId: created.id, created: true };
}

async function resolveWomanModerator(
  prisma: PrismaClient,
  options: LaunchContentOptions,
): Promise<{ userId: string | null; reason: string }> {
  const phone = options.womenModeratorPhone?.trim();
  if (!phone)
    return {
      userId: null,
      reason:
        "held: women-only, set LAUNCH_WOMEN_MODERATOR_PHONE to a verified woman's account",
    };
  const user = await prisma.user.findUnique({
    where: { phone_e164: phone },
    select: {
      id: true,
      status: true,
      profile: { select: { gender: true, trust_level: true } },
    },
  });
  if (
    !user ||
    user.status !== "ACTIVE" ||
    user.profile?.gender !== Gender.FEMALE ||
    !hasTrust(user.profile.trust_level, TrustLevel.IDENTITY)
  )
    return {
      userId: null,
      reason: `held: LAUNCH_WOMEN_MODERATOR_PHONE ${phone} is not an active, identity-verified woman`,
    };
  return { userId: user.id, reason: "" };
}

interface References {
  businessCategory: Map<string, string>;
  jobCategory: Map<string, string>;
  area: Map<string, string>;
  cityId: string | null;
}

async function resolveReferences(
  prisma: PrismaClient,
  content: IdeasAndGroups,
): Promise<References> {
  const businessSlugs = [
    ...new Set(content.ideas.map((idea) => idea.category)),
  ];
  const jobSlugs = [
    ...new Set(content.groups.flatMap((group) => group.jobCategory ?? [])),
  ];
  const areaNames = [
    ...new Set([
      ...content.ideas.map((idea) => idea.area),
      ...content.groups.flatMap((group) => group.area ?? []),
    ]),
  ];
  const [businessRows, jobRows, areaRows, city] = await Promise.all([
    prisma.businessCategory.findMany({
      where: { slug: { in: businessSlugs } },
      select: { id: true, slug: true },
    }),
    prisma.category.findMany({
      where: { slug: { in: jobSlugs }, is_active: true },
      select: { id: true, slug: true },
    }),
    prisma.location.findMany({
      where: {
        type: LocationType.AREA,
        is_active: true,
        name_en: { in: areaNames },
      },
      select: { id: true, name_en: true },
    }),
    prisma.location.findFirst({
      where: { type: LocationType.CITY, parent_id: null, name_en: "Rajshahi" },
      select: { id: true },
    }),
  ]);
  const problems: string[] = [];
  const businessCategory = new Map(
    businessRows.map((row) => [row.slug, row.id]),
  );
  const jobCategory = new Map(jobRows.map((row) => [row.slug, row.id]));
  for (const slug of businessSlugs)
    if (!businessCategory.has(slug))
      problems.push(`unknown business category "${slug}"`);
  for (const slug of jobSlugs)
    if (!jobCategory.has(slug))
      problems.push(`unknown work category "${slug}"`);
  const area = new Map<string, string>();
  for (const name of areaNames) {
    const matches = areaRows.filter((row) => row.name_en === name);
    if (matches.length !== 1)
      problems.push(
        `area "${name}" matches ${matches.length} active areas (needs exactly one)`,
      );
    else area.set(name, matches[0]!.id);
  }
  if (problems.length > 0)
    throw new LaunchContentError(
      `Launch content references that are not in the database (load reference data first): ${problems.join("; ")}.`,
    );
  return { businessCategory, jobCategory, area, cityId: city?.id ?? null };
}

async function upsertIdea(
  transaction: Prisma.TransactionClient,
  idea: IdeaContent,
  ownerId: string,
  refs: References,
): Promise<keyof Tally> {
  const fields = {
    title: idea.title,
    summary: idea.summary,
    problem: idea.problem,
    solution: idea.solution,
    details: idea.details ?? null,
    category_id: refs.businessCategory.get(idea.category)!,
    location_id: refs.area.get(idea.area)!,
    stage: idea.stage,
    visibility: idea.visibility,
  };
  const roleFields = idea.roles.map((role, index) => ({
    role_type: role.type,
    title: role.title,
    description: role.description,
    time_commitment: role.time,
    sort_order: index,
  }));
  const existing = await transaction.businessIdea.findUnique({
    where: { seed_key: idea.key },
    include: { roles: { orderBy: { sort_order: "asc" } } },
  });
  if (!existing) {
    await transaction.businessIdea.create({
      data: {
        seed_key: idea.key,
        owner_user_id: ownerId,
        ...fields,
        // The founder has not decided what partners get.
        roles: {
          create: roleFields.map((role) => ({
            ...role,
            arrangement: IdeaArrangement.UNDECIDED,
          })),
        },
      },
    });
    return "created";
  }

  let changed = Object.entries(fields).some(
    ([name, value]) => existing[name as keyof typeof fields] !== value,
  );
  if (changed)
    await transaction.businessIdea.update({
      where: { id: existing.id },
      data: fields,
    });
  // Roles are matched by position; an arrangement the founder chose later
  // in the app is kept.
  for (const [index, role] of roleFields.entries()) {
    const current = existing.roles[index];
    if (!current) {
      await transaction.ideaRole.create({
        data: { idea_id: existing.id, ...role },
      });
      changed = true;
      continue;
    }
    const same =
      current.role_type === role.role_type &&
      current.title === role.title &&
      current.description === role.description &&
      current.time_commitment === role.time_commitment &&
      current.sort_order === role.sort_order;
    if (!same) {
      await transaction.ideaRole.update({
        where: { id: current.id },
        data: role,
      });
      changed = true;
    }
  }
  // Roles no longer in the content close (people may have asked about them).
  const extra = existing.roles
    .slice(roleFields.length)
    .filter((role) => role.status === IdeaRoleStatus.OPEN);
  if (extra.length > 0) {
    await transaction.ideaRole.updateMany({
      where: { id: { in: extra.map((role) => role.id) } },
      data: { status: IdeaRoleStatus.CLOSED },
    });
    changed = true;
  }
  return changed ? "updated" : "unchanged";
}

async function upsertGroup(
  transaction: Prisma.TransactionClient,
  group: GroupContent,
  moderatorId: string,
  refs: References,
): Promise<keyof Tally> {
  const fields = {
    name: group.name,
    description: group.description ?? null,
    visibility: group.visibility,
    women_only: group.womenOnly,
    category_id: group.jobCategory
      ? refs.jobCategory.get(group.jobCategory)!
      : null,
    location_id: group.area ? refs.area.get(group.area)! : refs.cityId,
  };
  const existing = await transaction.communityGroup.findUnique({
    where: { seed_key: group.key },
  });
  let outcome: keyof Tally = "unchanged";
  let groupId: string;
  if (!existing) {
    groupId = (
      await transaction.communityGroup.create({
        data: {
          seed_key: group.key,
          created_by_user_id: moderatorId,
          ...fields,
        },
        select: { id: true },
      })
    ).id;
    outcome = "created";
  } else {
    groupId = existing.id;
    if (
      Object.entries(fields).some(
        ([name, value]) => existing[name as keyof typeof fields] !== value,
      )
    ) {
      await transaction.communityGroup.update({
        where: { id: existing.id },
        data: fields,
      });
      outcome = "updated";
    }
  }
  const membership = await transaction.communityGroupMember.findUnique({
    where: { group_id_user_id: { group_id: groupId, user_id: moderatorId } },
  });
  if (
    !membership ||
    membership.role !== GroupMemberRole.MODERATOR ||
    membership.status !== GroupMemberStatus.ACTIVE
  ) {
    await transaction.communityGroupMember.upsert({
      where: { group_id_user_id: { group_id: groupId, user_id: moderatorId } },
      create: {
        group_id: groupId,
        user_id: moderatorId,
        role: GroupMemberRole.MODERATOR,
        status: GroupMemberStatus.ACTIVE,
        joined_at: new Date(),
      },
      update: {
        role: GroupMemberRole.MODERATOR,
        status: GroupMemberStatus.ACTIVE,
        removed_at: null,
        joined_at: membership?.joined_at ?? new Date(),
      },
    });
    if (outcome === "unchanged") outcome = "updated";
  }
  return outcome;
}
