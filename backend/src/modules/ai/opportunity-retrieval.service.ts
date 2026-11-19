import { Inject, Injectable } from "@nestjs/common";
import {
  Gender,
  GroupMemberStatus,
  GroupVisibility,
  JobStatus,
  Prisma,
} from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { WORK_ONLY } from "../jobs/opportunity";
import { LEARNING_ONLY } from "../learning/learning.service";
import { MentorsService } from "../mentors/mentors.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { redactText } from "./redaction";

export type OpportunityKind = "JOB" | "LEARNING" | "MENTOR" | "GROUP";

interface Area {
  nameEn: string;
  nameBn: string;
}

/** A retrieved candidate: what the client gets and what the model sees. */
export interface Candidate {
  ref: string;
  kind: OpportunityKind;
  id: string;
  title: string;
  area: Area | null;
  /** The model's view: no ids, no names of people, redacted free text. */
  forModel: Record<string, unknown>;
}

export interface Retrieval {
  me: Record<string, unknown>;
  candidates: Candidate[];
}

const PER_KIND = { JOB: 12, LEARNING: 8, MENTOR: 8, GROUP: 8 } as const;
const poishaToBdt = (value: bigint | null) =>
  value === null ? null : Number(value / 100n);

/**
 * Retrieval for opportunity suggestions: KAAJ's own open jobs, learning
 * opportunities, accepting mentors and public groups, filtered the way the
 * feeds filter them (open, not expired, not one's own, nobody in a block,
 * women-only groups only for profiles marked female). The model never
 * searches; it only ranks this list.
 */
@Injectable()
export class OpportunityRetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: UserBlocksService,
    private readonly mentors: MentorsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async retrieve(userId: string, kinds: OpportunityKind[]): Promise<Retrieval> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        role_modes: true,
        profile: {
          select: {
            gender: true,
            primary_location_id: true,
            primary_location: {
              select: {
                name_en: true,
                parent_id: true,
                parent: { select: { name_en: true } },
              },
            },
          },
        },
        skills: {
          select: {
            skill_id: true,
            level: true,
            years: true,
            skill: { select: { name_en: true } },
          },
          take: 20,
        },
        worker_profile: {
          select: {
            headline: true,
            experience_years: true,
            preferred_arrangements: true,
            prefers_flexible_hours: true,
          },
        },
      },
    });
    const hidden = [userId, ...(await this.blocks.hiddenFrom(userId))];
    const locationIds = [
      user.profile?.primary_location_id,
      user.profile?.primary_location?.parent_id,
    ].filter((id): id is string => typeof id === "string");
    const skillIds = user.skills.map((item) => item.skill_id);
    const near: Prisma.LocationWhereInput | undefined = locationIds.length
      ? {
          OR: [{ id: { in: locationIds } }, { parent_id: { in: locationIds } }],
        }
      : undefined;

    const me = {
      roles: user.role_modes,
      area: user.profile?.primary_location
        ? [
            user.profile.primary_location.name_en,
            user.profile.primary_location.parent?.name_en,
          ]
            .filter(Boolean)
            .join(", ")
        : null,
      skills: user.skills.map((item) => ({
        skill: item.skill.name_en,
        level: item.level,
        years: item.years === null ? null : Number(item.years),
      })),
      headline: redactText(user.worker_profile?.headline),
      experienceYears: user.worker_profile?.experience_years ?? null,
      preferredArrangements: user.worker_profile?.preferred_arrangements ?? [],
      prefersFlexibleHours:
        user.worker_profile?.prefers_flexible_hours ?? false,
    };

    const [jobs, learning, mentors, groups] = await Promise.all([
      kinds.includes("JOB")
        ? this.jobs(hidden, near, skillIds, false)
        : Promise.resolve([]),
      kinds.includes("LEARNING")
        ? this.jobs(hidden, near, skillIds, true)
        : Promise.resolve([]),
      kinds.includes("MENTOR")
        ? this.mentorCandidates(userId, user.profile?.primary_location_id)
        : Promise.resolve([]),
      kinds.includes("GROUP")
        ? this.groups(
            userId,
            hidden,
            near,
            user.profile?.gender === Gender.FEMALE,
          )
        : Promise.resolve([]),
    ]);
    return { me, candidates: [...jobs, ...learning, ...mentors, ...groups] };
  }

  private async jobs(
    hidden: string[],
    near: Prisma.LocationWhereInput | undefined,
    skillIds: string[],
    learning: boolean,
  ): Promise<Candidate[]> {
    const limit = learning ? PER_KIND.LEARNING : PER_KIND.JOB;
    const base: Prisma.JobWhereInput = {
      ...(learning ? LEARNING_ONLY : WORK_ONLY),
      status: JobStatus.APPLICATIONS_OPEN,
      deleted_at: null,
      poster_user_id: { notIn: hidden },
      OR: [{ expires_at: null }, { expires_at: { gt: this.clock.now() } }],
    };
    const relevant: Prisma.JobWhereInput[] = [];
    if (near) relevant.push({ location: near });
    if (skillIds.length)
      relevant.push({ skills: { some: { skill_id: { in: skillIds } } } });
    const select = {
      id: true,
      title: true,
      job_type: true,
      payment_model: true,
      budget_min_poisha: true,
      budget_max_poisha: true,
      work_arrangement: true,
      flexible_hours: true,
      opportunity_type: true,
      participant_terms: true,
      participant_fee_poisha: true,
      category: { select: { name_en: true } },
      location: { select: { name_en: true, name_bn: true } },
      skills: { select: { skill: { select: { name_en: true } } }, take: 5 },
    } satisfies Prisma.JobSelect;
    const orderBy: Prisma.JobOrderByWithRelationInput[] = [
      { published_at: "desc" },
      { id: "desc" },
    ];
    const first = relevant.length
      ? await this.prisma.job.findMany({
          where: { AND: [base, { OR: relevant }] },
          select,
          orderBy,
          take: limit,
        })
      : [];
    const rows =
      first.length >= limit / 2
        ? first
        : [
            ...first,
            ...(await this.prisma.job.findMany({
              where: {
                AND: [base, { id: { notIn: first.map((row) => row.id) } }],
              },
              select,
              orderBy,
              take: limit - first.length,
            })),
          ];
    const prefix = learning ? "L" : "J";
    return rows.map((row, index) => ({
      ref: `${prefix}${index + 1}`,
      kind: learning ? "LEARNING" : "JOB",
      id: row.id,
      title: row.title,
      area: { nameEn: row.location.name_en, nameBn: row.location.name_bn },
      forModel: {
        ref: `${prefix}${index + 1}`,
        title: redactText(row.title),
        category: row.category.name_en,
        area: row.location.name_en,
        skills: row.skills.map((item) => item.skill.name_en),
        arrangement: row.work_arrangement,
        flexibleHours: row.flexible_hours,
        ...(learning
          ? {
              type: row.opportunity_type,
              terms: row.participant_terms,
              participantFeeBdt: poishaToBdt(row.participant_fee_poisha),
            }
          : {
              jobType: row.job_type,
              payment: row.payment_model,
              payBdt: {
                min: poishaToBdt(row.budget_min_poisha),
                max: poishaToBdt(row.budget_max_poisha),
              },
            }),
      },
    }));
  }

  private async mentorCandidates(
    userId: string,
    locationId: string | null | undefined,
  ): Promise<Candidate[]> {
    // The directory applies blocks, approval, accepting and discoverability.
    const local = await this.mentors.directory(userId, {
      limit: PER_KIND.MENTOR,
      ...(locationId ? { locationId } : {}),
    });
    const items =
      local.items.length > 0 || !locationId
        ? local.items
        : (await this.mentors.directory(userId, { limit: PER_KIND.MENTOR }))
            .items;
    return items.map((mentor, index) => ({
      ref: `M${index + 1}`,
      kind: "MENTOR",
      id: mentor.id,
      title: mentor.displayName,
      area: mentor.area,
      // No name, bio or photo: skills, experience and area only.
      forModel: {
        ref: `M${index + 1}`,
        skills: mentor.skills.map((skill) => ({
          skill: skill.nameEn,
          level: skill.level,
        })),
        yearsExperience: mentor.yearsExperience,
        area: mentor.area?.nameEn ?? null,
      },
    }));
  }

  private async groups(
    userId: string,
    hidden: string[],
    near: Prisma.LocationWhereInput | undefined,
    female: boolean,
  ): Promise<Candidate[]> {
    const base: Prisma.CommunityGroupWhereInput = {
      visibility: GroupVisibility.PUBLIC,
      hidden_at: null,
      deleted_at: null,
      created_by_user_id: { notIn: hidden.filter((id) => id !== userId) },
      ...(female ? {} : { women_only: false }),
      members: {
        none: {
          user_id: userId,
          status: { in: [GroupMemberStatus.ACTIVE, GroupMemberStatus.PENDING] },
        },
      },
    };
    const select = {
      id: true,
      name: true,
      description: true,
      women_only: true,
      category: { select: { name_en: true } },
      location: { select: { name_en: true, name_bn: true } },
      _count: {
        select: { members: { where: { status: GroupMemberStatus.ACTIVE } } },
      },
    } satisfies Prisma.CommunityGroupSelect;
    const orderBy: Prisma.CommunityGroupOrderByWithRelationInput[] = [
      { updated_at: "desc" },
      { id: "desc" },
    ];
    const first = near
      ? await this.prisma.communityGroup.findMany({
          where: { AND: [base, { location: near }] },
          select,
          orderBy,
          take: PER_KIND.GROUP,
        })
      : [];
    const rows =
      first.length >= PER_KIND.GROUP / 2
        ? first
        : [
            ...first,
            ...(await this.prisma.communityGroup.findMany({
              where: {
                AND: [base, { id: { notIn: first.map((row) => row.id) } }],
              },
              select,
              orderBy,
              take: PER_KIND.GROUP - first.length,
            })),
          ];
    return rows.map((row, index) => ({
      ref: `G${index + 1}`,
      kind: "GROUP",
      id: row.id,
      title: row.name,
      area: row.location
        ? { nameEn: row.location.name_en, nameBn: row.location.name_bn }
        : null,
      forModel: {
        ref: `G${index + 1}`,
        name: redactText(row.name),
        about: redactText(row.description)?.slice(0, 300) ?? null,
        category: row.category?.name_en ?? null,
        area: row.location?.name_en ?? null,
        members: row._count.members,
        womenOnly: row.women_only,
      },
    }));
  }
}
