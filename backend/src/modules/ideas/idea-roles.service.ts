import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import {
  IdeaArrangement,
  IdeaRoleStatus,
  IdeaRoleType,
  MentorStatus,
  Prisma,
  TrustLevel,
  UserStatus,
} from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  CollaborationService,
  CollaborationSubject,
  IdeaSubjectResolver,
} from "../business/collaboration.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { visibleDisplayName } from "../users/public-profile.projection";
import { hasTrust } from "../verification/trust-level";
import { CreateIdeaRoleDto, UpdateIdeaRoleDto } from "./dto/idea.dto";
import { ideaErrors } from "./ideas.errors";
import { IdeasService } from "./ideas.service";
import { isTeam } from "./idea-visibility";
import { roleInclude, serializeRole } from "./idea-roles.serializer";

const MAX_ROLES = 10;
const MAX_MATCHES = 20;
/** How many people are scored per pass (nearby, then everyone else). */
const CANDIDATE_POOL = 300;
/** Roles where an approved mentor is a natural fit. */
const MENTOR_ROLES = new Set<IdeaRoleType>([
  IdeaRoleType.MENTOR,
  IdeaRoleType.INDUSTRY_EXPERT,
]);

type Reason = { code: string; en: string; bn: string; points: number };

/**
 * P2.8: the roles an idea seeks, and explainable rule-based matches from
 * real KAAJ users (skills, area, availability, verification). Only people
 * who are discoverable, active and not in a block with the owner appear.
 * Also resolves IDEA subjects for collaboration requests ("I'm interested
 * in this role").
 */
@Injectable()
export class IdeaRolesService implements OnModuleInit, IdeaSubjectResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ideas: IdeasService,
    @Optional() private readonly collaboration?: CollaborationService,
    @Optional() private readonly userBlocks?: UserBlocksService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  onModuleInit() {
    this.collaboration?.registerIdeaResolver(this);
  }

  /** Roles as the viewer may see them (404 unless they may see the idea). */
  async list(viewerUserId: string, ideaId: string) {
    const relation = await this.ideas.relationOr404(viewerUserId, ideaId);
    const rows = await this.prisma.ideaRole.findMany({
      where: {
        idea_id: ideaId,
        ...(isTeam(relation)
          ? {}
          : { status: IdeaRoleStatus.OPEN, hidden_at: null }),
      },
      include: roleInclude,
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
    });
    return { items: rows.map(serializeRole) };
  }

  async create(userId: string, ideaId: string, input: CreateIdeaRoleDto) {
    const count = await this.prisma.ideaRole.count({
      where: { idea_id: ideaId },
    });
    if (count >= MAX_ROLES) throw ideaErrors.roleLimit();
    await this.assertSkills(input.skillIds);
    const role = await this.prisma.ideaRole.create({
      data: {
        idea_id: ideaId,
        role_type: input.roleType,
        title: input.title?.trim() || null,
        description: input.description?.trim() || null,
        time_commitment: input.timeCommitment,
        arrangement: input.arrangement ?? IdeaArrangement.UNDECIDED,
        sort_order: count,
        skills: { create: input.skillIds.map((skill_id) => ({ skill_id })) },
      },
      include: roleInclude,
    });
    await this.ideas.audit(userId, "IDEA_ROLE_CREATED", ideaId, {
      roleId: role.id,
      roleType: role.role_type,
    });
    return serializeRole(role);
  }

  async update(
    userId: string,
    ideaId: string,
    roleId: string,
    input: UpdateIdeaRoleDto,
  ) {
    await this.owned(ideaId, roleId);
    if (input.skillIds) await this.assertSkills(input.skillIds);
    const role = await this.prisma.$transaction(async (transaction) => {
      if (input.skillIds) {
        await transaction.ideaRoleSkill.deleteMany({
          where: { role_id: roleId },
        });
        await transaction.ideaRoleSkill.createMany({
          data: input.skillIds.map((skill_id) => ({
            role_id: roleId,
            skill_id,
          })),
        });
      }
      return transaction.ideaRole.update({
        where: { id: roleId },
        data: {
          role_type: input.roleType,
          title:
            input.title === undefined ? undefined : input.title?.trim() || null,
          description:
            input.description === undefined
              ? undefined
              : input.description?.trim() || null,
          time_commitment: input.timeCommitment,
          arrangement: input.arrangement,
          status: input.status,
        },
        include: roleInclude,
      });
    });
    await this.ideas.audit(userId, "IDEA_ROLE_UPDATED", ideaId, {
      roleId,
      fields: Object.keys(input),
    });
    return serializeRole(role);
  }

  async remove(userId: string, ideaId: string, roleId: string) {
    await this.owned(ideaId, roleId);
    await this.prisma.ideaRole.delete({ where: { id: roleId } });
    await this.ideas.audit(userId, "IDEA_ROLE_DELETED", ideaId, { roleId });
    return { id: roleId, deleted: true };
  }

  /**
   * Rule-based matches for one role, each with its reasons. Candidates are
   * people with one of the role's skills (and, for mentor or expert roles,
   * approved mentors who teach them).
   */
  async matches(ownerUserId: string, ideaId: string, roleId: string) {
    const role = await this.owned(ideaId, roleId);
    const idea = await this.prisma.businessIdea.findUniqueOrThrow({
      where: { id: ideaId },
      select: {
        location_id: true,
        location: { select: { id: true, parent_id: true } },
        members: { select: { user_id: true } },
      },
    });
    const skillIds = role.skills.map(({ skill_id }) => skill_id);
    const explanation = {
      source: "FROM_KAAJ",
      en: "Suggested from KAAJ profiles by skills, area, availability and verification. People who are hidden or blocked never appear.",
      bn: "দক্ষতা, এলাকা, সময় ও যাচাইয়ের ভিত্তিতে KAAJ প্রোফাইল থেকে প্রস্তাব। লুকানো বা ব্লক করা কেউ কখনো আসে না।",
    };
    if (skillIds.length === 0)
      return {
        roleId,
        items: [],
        explanation: {
          ...explanation,
          en: "Add the skills this role needs to see matches.",
          bn: "মিল পেতে এই ভূমিকার জন্য দক্ষতা যোগ করুন।",
        },
      };
    const hidden = await this.blocks.hiddenFrom(ownerUserId);
    const excluded = [
      ownerUserId,
      ...idea.members.map((member) => member.user_id),
      ...hidden,
    ];
    const candidateSelect = {
      id: true,
      profile: {
        select: {
          display_name: true,
          show_full_name: true,
          trust_level: true,
          mentor_status: true,
          primary_location: {
            select: { id: true, parent_id: true, name_en: true, name_bn: true },
          },
        },
      },
      skills: {
        where: { skill_id: { in: skillIds } },
        select: {
          is_verified: true,
          can_mentor: true,
          skill: { select: { id: true, name_en: true, name_bn: true } },
        },
      },
      availability_rules: {
        where: { is_active: true },
        select: { id: true },
        take: 1,
      },
    } satisfies Prisma.UserSelect;
    const base = {
      id: { notIn: excluded },
      status: UserStatus.ACTIVE,
      deleted_at: null,
      skills: { some: { skill_id: { in: skillIds } } },
    } satisfies Prisma.UserWhereInput;
    // Nearby people first (same area or thana), then everyone else, each
    // bounded, so the closest matches are always considered.
    const nearbyIds = idea.location
      ? [idea.location.id, idea.location.parent_id].filter(
          (value): value is string => Boolean(value),
        )
      : [];
    const nearby = nearbyIds.length
      ? await this.prisma.user.findMany({
          where: {
            ...base,
            profile: {
              discoverable: true,
              primary_location: {
                OR: [
                  { id: { in: nearbyIds } },
                  { parent_id: { in: nearbyIds } },
                ],
              },
            },
          },
          select: candidateSelect,
          orderBy: { id: "asc" },
          take: CANDIDATE_POOL,
        })
      : [];
    const rest = await this.prisma.user.findMany({
      where: {
        ...base,
        id: { notIn: [...excluded, ...nearby.map((row) => row.id)] },
        profile: { discoverable: true },
      },
      select: candidateSelect,
      orderBy: { id: "asc" },
      take: CANDIDATE_POOL,
    });
    const candidates = [...nearby, ...rest];
    const scored = candidates.map((candidate) => {
      const reasons: Reason[] = [];
      const matched = candidate.skills;
      const verifiedSkills = matched.filter((row) => row.is_verified);
      reasons.push({
        code: "SKILLS",
        en: `Has ${matched.length} of the ${skillIds.length} skills this role needs`,
        bn: `এই ভূমিকার ${skillIds.length}টি দক্ষতার মধ্যে ${matched.length}টি আছে`,
        points: Math.min(60, 30 * matched.length),
      });
      if (verifiedSkills.length)
        reasons.push({
          code: "SKILL_VERIFIED",
          en: "Skill checked by KAAJ",
          bn: "দক্ষতা KAAJ যাচাই করেছে",
          points: 10,
        });
      const area = candidate.profile?.primary_location;
      if (idea.location && area) {
        if (area.id === idea.location.id)
          reasons.push({
            code: "SAME_AREA",
            en: "Lives in the idea's area",
            bn: "আইডিয়ার এলাকাতেই থাকেন",
            points: 20,
          });
        else if (
          area.parent_id &&
          (area.parent_id === idea.location.parent_id ||
            area.parent_id === idea.location.id)
        )
          reasons.push({
            code: "NEARBY",
            en: "Lives nearby (same thana)",
            bn: "কাছাকাছি থাকেন (একই থানা)",
            points: 10,
          });
      }
      if (candidate.availability_rules.length)
        reasons.push({
          code: "AVAILABLE",
          en: "Has set available hours",
          bn: "কাজের সময় নির্ধারণ করেছেন",
          points: 10,
        });
      const trust = candidate.profile?.trust_level ?? TrustLevel.NONE;
      if (hasTrust(trust, TrustLevel.IDENTITY))
        reasons.push({
          code: "IDENTITY_VERIFIED",
          en: "Identity verified",
          bn: "পরিচয় যাচাই করা",
          points: 15,
        });
      if (
        MENTOR_ROLES.has(role.role_type) &&
        candidate.profile?.mentor_status === MentorStatus.APPROVED &&
        matched.some((row) => row.can_mentor)
      )
        reasons.push({
          code: "APPROVED_MENTOR",
          en: "Approved KAAJ mentor for this skill",
          bn: "এই দক্ষতার অনুমোদিত KAAJ মেন্টর",
          points: 15,
        });
      return {
        userId: candidate.id,
        displayName: visibleDisplayName(candidate.profile?.display_name ?? "", {
          showFullName: candidate.profile?.show_full_name ?? false,
          hired: false,
        }),
        trustLevel: trust,
        area: area
          ? { id: area.id, nameEn: area.name_en, nameBn: area.name_bn }
          : null,
        score: reasons.reduce((sum, reason) => sum + reason.points, 0),
        matchedSkills: matched.map((row) => ({
          id: row.skill.id,
          nameEn: row.skill.name_en,
          nameBn: row.skill.name_bn,
          verified: row.is_verified,
        })),
        reasons,
      };
    });
    scored.sort(
      (left, right) =>
        right.score - left.score || left.userId.localeCompare(right.userId),
    );
    return { roleId, items: scored.slice(0, MAX_MATCHES), explanation };
  }

  /** IdeaSubjectResolver: a collaboration request about an idea or role. */
  async resolveForRequest(
    requesterUserId: string,
    ideaId: string,
    ideaRoleId?: string,
  ): Promise<CollaborationSubject> {
    const relation = await this.ideas.relationOr404(requesterUserId, ideaId);
    if (isTeam(relation))
      throw new ConflictException({
        code: "OWN_SUBJECT",
        message: "You are already on this idea's team.",
        messageKey: "error.collaboration.own_subject",
      });
    const idea = await this.prisma.businessIdea.findUniqueOrThrow({
      where: { id: ideaId },
      select: { owner_user_id: true, title: true, summary: true },
    });
    if (ideaRoleId) {
      const role = await this.prisma.ideaRole.findFirst({
        where: { id: ideaRoleId, idea_id: ideaId, hidden_at: null },
        select: { status: true },
      });
      if (!role) throw ideaErrors.notFound();
      if (role.status !== IdeaRoleStatus.OPEN) throw ideaErrors.roleNotOpen();
    }
    return {
      recipientUserId: idea.owner_user_id,
      title: idea.title,
      summary: idea.summary,
      ideaRoleId: ideaRoleId ?? null,
    };
  }

  /** The public title and line (what the requester saw when asking). */
  async describe(ideaId: string) {
    const idea = await this.prisma.businessIdea.findUnique({
      where: { id: ideaId },
      select: { title: true, summary: true, deleted_at: true },
    });
    return idea && !idea.deleted_at
      ? { title: idea.title, summary: idea.summary }
      : null;
  }

  private async owned(ideaId: string, roleId: string) {
    const role = await this.prisma.ideaRole.findFirst({
      where: { id: roleId, idea_id: ideaId },
      include: { skills: { select: { skill_id: true } } },
    });
    if (!role) throw ideaErrors.notFound();
    return role;
  }

  private async assertSkills(skillIds: string[]) {
    if (!skillIds.length) return;
    const count = await this.prisma.skill.count({
      where: { id: { in: skillIds }, is_active: true },
    });
    if (count !== skillIds.length)
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Unknown or inactive skill.",
        messageKey: "error.validation.failed",
        field: "skillIds",
      });
  }
}
