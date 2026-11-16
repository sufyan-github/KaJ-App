import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import {
  MentorStatus,
  Prisma,
  RoleMode,
  SkillLevel,
  TrustLevel,
  UserStatus,
  VerificationKind,
  VerificationStatus,
} from "@prisma/client";

import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { visibleDisplayName } from "../users/public-profile.projection";
import { hasTrust } from "../verification/trust-level";
import { VerificationService } from "../verification/verification.service";
import {
  MentorApplicationDto,
  MentorDirectoryQueryDto,
  UpdateMentorDto,
} from "./dto/mentor.dto";
import { mentorErrors } from "./mentor.errors";

/**
 * The mentor capability (P1.1): apply with skills, expertise and skill
 * evidence; an admin approves through the verification queue; only then can
 * the person publish learning opportunities.
 */
@Injectable()
export class MentorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VerificationService,
    @Optional() private readonly userBlocks?: UserBlocksService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  async get(userId: string) {
    const [profile, skills, request] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { user_id: userId },
        select: mentorProfileSelect,
      }),
      this.prisma.userSkill.findMany({
        where: { user_id: userId, can_mentor: true },
        include: { skill: true },
        orderBy: { created_at: "asc" },
      }),
      this.prisma.verificationRequest.findFirst({
        where: { user_id: userId, kind: VerificationKind.MENTOR },
        orderBy: { created_at: "desc" },
        select: { id: true, status: true, rejection_reason: true },
      }),
    ]);
    return {
      status: profile?.mentor_status ?? MentorStatus.NONE,
      accepting: profile?.mentor_accepting ?? false,
      bio: profile?.mentor_bio ?? null,
      yearsExperience: profile?.mentor_years_experience ?? null,
      appliedAt: profile?.mentor_applied_at?.toISOString() ?? null,
      approvedAt: profile?.mentor_approved_at?.toISOString() ?? null,
      skills: skills.map((row) => ({
        skillId: row.skill_id,
        nameEn: row.skill.name_en,
        nameBn: row.skill.name_bn,
        level: row.level,
      })),
      rejectionReason:
        request?.status === VerificationStatus.REJECTED
          ? request.rejection_reason
          : null,
      application: request
        ? {
            verificationRequestId: request.id,
            status: request.status,
            rejectionReason:
              request.status === VerificationStatus.REJECTED
                ? request.rejection_reason
                : null,
          }
        : null,
    };
  }

  async apply(userId: string, input: MentorApplicationDto) {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { mentor_status: true, trust_level: true },
    });
    const status = profile?.mentor_status ?? MentorStatus.NONE;
    if (status === MentorStatus.APPROVED) throw mentorErrors.alreadyApproved();
    if (status === MentorStatus.PENDING) throw mentorErrors.pending();
    if (status === MentorStatus.SUSPENDED) throw mentorErrors.suspended();
    if (!hasTrust(profile?.trust_level ?? TrustLevel.NONE, TrustLevel.IDENTITY))
      throw mentorErrors.identityRequired();

    const offered =
      input.skills ??
      (input.skillIds ?? []).map((skillId) => ({ skillId, level: undefined }));
    if (offered.length === 0)
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Choose at least one skill to teach.",
        messageKey: "error.validation.failed",
        field: "skills",
      });
    const skillIds = [...new Set(offered.map((item) => item.skillId))];
    const active = await this.prisma.skill.count({
      where: { id: { in: skillIds }, is_active: true },
    });
    if (active !== skillIds.length || skillIds.length !== offered.length)
      throw new BadRequestException(
        "Every skill must be active, known and listed once.",
      );

    // The evidence goes through the normal verification pipeline (document
    // ownership, single use, admin review, purge schedule).
    const request = await this.verification.submit(
      userId,
      { kind: VerificationKind.MENTOR, documentIds: input.documentIds },
      { viaMentorApplication: true },
    );

    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.profile.update({
        where: { user_id: userId },
        data: {
          mentor_status: MentorStatus.PENDING,
          mentor_bio: input.bio.trim(),
          mentor_years_experience: input.yearsExperience,
          mentor_applied_at: now,
          mentor_accepting: false,
        },
      });
      // Offered skills: shown only once the mentor is approved.
      await transaction.userSkill.updateMany({
        where: { user_id: userId, skill_id: { notIn: skillIds } },
        data: { can_mentor: false },
      });
      for (const item of offered)
        await transaction.userSkill.upsert({
          where: {
            user_id_skill_id: { user_id: userId, skill_id: item.skillId },
          },
          update: { can_mentor: true },
          create: {
            user_id: userId,
            skill_id: item.skillId,
            level: item.level ?? SkillLevel.ADVANCED,
            can_mentor: true,
          },
        });
    });
    return { ...(await this.get(userId)), verificationRequestId: request.id };
  }

  async update(userId: string, input: UpdateMentorDto) {
    await this.assertApproved(userId);
    await this.prisma.profile.update({
      where: { user_id: userId },
      data: {
        mentor_accepting: input.accepting,
        mentor_bio: input.bio?.trim(),
        mentor_years_experience: input.yearsExperience,
      },
    });
    return this.get(userId);
  }

  /** Throws unless the user is an approved, active mentor. */
  async assertApproved(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role_modes: true,
        profile: { select: { mentor_status: true } },
      },
    });
    const status = user?.profile?.mentor_status ?? MentorStatus.NONE;
    if (status === MentorStatus.SUSPENDED) throw mentorErrors.suspended();
    if (
      status !== MentorStatus.APPROVED ||
      !user?.role_modes.includes(RoleMode.MENTOR)
    )
      throw mentorErrors.approvalRequired();
  }

  /** Approved mentors taking learners, for the Learn tab. */
  async directory(viewerUserId: string, query: MentorDirectoryQueryDto) {
    const limit = query.limit ?? 20;
    const hidden = [
      viewerUserId,
      ...(await this.blocks.hiddenFrom(viewerUserId)),
    ];
    const rows = await this.prisma.user.findMany({
      where: {
        id: { notIn: hidden },
        status: UserStatus.ACTIVE,
        deleted_at: null,
        role_modes: { has: RoleMode.MENTOR },
        profile: {
          is: {
            mentor_status: MentorStatus.APPROVED,
            mentor_accepting: true,
            discoverable: true,
            ...(query.locationId
              ? { primary_location_id: query.locationId }
              : {}),
          },
        },
        skills: {
          some: {
            can_mentor: true,
            ...(query.skillId ? { skill_id: query.skillId } : {}),
          },
        },
      },
      select: {
        id: true,
        profile: {
          select: {
            display_name: true,
            show_full_name: true,
            trust_level: true,
            mentor_bio: true,
            mentor_years_experience: true,
            primary_location: { select: { name_en: true, name_bn: true } },
          },
        },
        skills: {
          where: { can_mentor: true },
          select: {
            level: true,
            skill: { select: { id: true, name_en: true, name_bn: true } },
          },
        },
      },
      orderBy: [{ profile: { mentor_approved_at: "desc" } }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((row) => ({
        id: row.id,
        displayName: visibleDisplayName(row.profile?.display_name ?? "", {
          showFullName: row.profile?.show_full_name ?? false,
          hired: false,
        }),
        trustLevel: row.profile?.trust_level ?? TrustLevel.NONE,
        bio: row.profile?.mentor_bio ?? null,
        yearsExperience: row.profile?.mentor_years_experience ?? null,
        area: row.profile?.primary_location
          ? {
              nameEn: row.profile.primary_location.name_en,
              nameBn: row.profile.primary_location.name_bn,
            }
          : null,
        skills: row.skills.map((item) => ({
          skillId: item.skill.id,
          nameEn: item.skill.name_en,
          nameBn: item.skill.name_bn,
          level: item.level,
        })),
      })),
    };
  }
}

const mentorProfileSelect = {
  mentor_status: true,
  mentor_accepting: true,
  mentor_bio: true,
  mentor_years_experience: true,
  mentor_applied_at: true,
  mentor_approved_at: true,
} satisfies Prisma.ProfileSelect;
