import { Injectable, Optional } from "@nestjs/common";
import {
  BusinessMemberRole,
  BusinessStage,
  CollaborationStatus,
  CollaborationSubjectType,
  IdeaRoleStatus,
  IdeaStage,
} from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { businessErrors } from "../business/business.errors";
import { BusinessesService } from "../business/businesses.service";
import { COLLABORATION_NOTICE } from "../business/collaboration.service";
import { ChatService } from "../chat/chat.service";
import { NotificationsService } from "../notifications/notifications.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { AddIdeaMemberDto, ConvertIdeaDto } from "./dto/idea.dto";
import { ideaErrors } from "./ideas.errors";
import { IdeasService } from "./ideas.service";
import { isTeam } from "./idea-visibility";
import { ROLE_LABEL } from "./idea-roles.serializer";

const MAX_OWNED_BUSINESSES = 5;

/**
 * P2.9: the team — people "agreed in principle" from an AGREED
 * collaboration request (never ownership, equity or a legal partnership) —
 * and converting an idea into a business profile.
 */
@Injectable()
export class IdeaTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ideas: IdeasService,
    private readonly businesses: BusinessesService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly userBlocks?: UserBlocksService,
    @Optional() private readonly chat?: ChatService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  /** The owner and the team see the team; anyone else gets 404. */
  async members(viewerUserId: string, ideaId: string) {
    const relation = await this.ideas.relationOr404(viewerUserId, ideaId);
    if (!isTeam(relation)) throw ideaErrors.notFound();
    const [idea, rows] = await Promise.all([
      this.prisma.businessIdea.findUniqueOrThrow({
        where: { id: ideaId },
        select: {
          owner_user_id: true,
          created_at: true,
          owner: { select: { profile: { select: { display_name: true } } } },
        },
      }),
      this.prisma.ideaMember.findMany({
        where: { idea_id: ideaId },
        include: {
          user: { select: { profile: { select: { display_name: true } } } },
          role: { select: { id: true, role_type: true, title: true } },
        },
        orderBy: [{ agreed_in_principle_at: "asc" }, { id: "asc" }],
      }),
    ]);
    return {
      notice: COLLABORATION_NOTICE,
      owner: {
        userId: idea.owner_user_id,
        displayName: idea.owner.profile?.display_name?.trim() ?? "",
      },
      items: rows.map((row) => ({
        userId: row.user_id,
        // A team works together: full names among them.
        displayName: row.user.profile?.display_name?.trim() ?? "",
        role: row.role
          ? {
              id: row.role.id,
              roleType: row.role.role_type,
              roleLabel: ROLE_LABEL[row.role.role_type],
              title: row.role.title,
            }
          : null,
        roleLabel: row.role_label,
        status: "AGREED_IN_PRINCIPLE",
        agreedInPrincipleAt: row.agreed_in_principle_at.toISOString(),
        collaborationRequestId: row.collaboration_request_id,
      })),
    };
  }

  /**
   * P3.3: the idea room — a group conversation of the owner and the team
   * (members follow the team). Team only; anyone else gets 404.
   */
  async room(viewerUserId: string, ideaId: string) {
    const relation = await this.ideas.relationOr404(viewerUserId, ideaId);
    if (!isTeam(relation)) throw ideaErrors.notFound();
    const conversationId = await this.syncRoom(ideaId, true);
    return { ideaId, conversationId };
  }

  private async syncRoom(ideaId: string, create = false) {
    if (!this.chat) return null;
    const idea = await this.prisma.businessIdea.findUniqueOrThrow({
      where: { id: ideaId },
      select: {
        title: true,
        owner_user_id: true,
        members: { select: { user_id: true } },
      },
    });
    const input = {
      scopeKey: `idea-room:${ideaId}`,
      title: idea.title,
      subjectType: "IDEA_ROOM",
      subjectId: ideaId,
      memberIds: [
        idea.owner_user_id,
        ...idea.members.map((row) => row.user_id),
      ],
    };
    if (create) return this.chat.syncGroup(input);
    await this.chat.syncGroupIfExists(input);
    return null;
  }

  /** The owner adds someone they reached an AGREED collaboration with. */
  async add(ownerUserId: string, ideaId: string, input: AddIdeaMemberDto) {
    const request = await this.prisma.collaborationRequest.findFirst({
      where: {
        id: input.collaborationRequestId,
        subject_type: CollaborationSubjectType.IDEA,
        subject_id: ideaId,
        recipient_user_id: ownerUserId,
        hidden_at: null,
      },
    });
    if (!request) throw ideaErrors.notFound();
    if (request.status !== CollaborationStatus.AGREED || !request.agreed_at)
      throw ideaErrors.notAgreed();
    if (await this.blocks.between(ownerUserId, request.requester_user_id))
      throw ideaErrors.notFound();
    const exists = await this.prisma.ideaMember.count({
      where: { idea_id: ideaId, user_id: request.requester_user_id },
    });
    if (exists) throw ideaErrors.alreadyMember();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.ideaMember.create({
        data: {
          idea_id: ideaId,
          user_id: request.requester_user_id,
          role_id: request.idea_role_id,
          role_label: input.roleLabel?.trim() || null,
          collaboration_request_id: request.id,
          agreed_in_principle_at: request.agreed_at!,
        },
      });
      if (request.idea_role_id)
        await transaction.ideaRole.updateMany({
          where: { id: request.idea_role_id, idea_id: ideaId },
          data: { status: IdeaRoleStatus.FILLED },
        });
    });
    await this.syncRoom(ideaId);
    await this.ideas.audit(ownerUserId, "IDEA_MEMBER_ADDED", ideaId, {
      userId: request.requester_user_id,
      collaborationRequestId: request.id,
    });
    const idea = await this.ideas.load(ideaId);
    await this.notifications?.create({
      userId: request.requester_user_id,
      type: "IDEA_TEAM_ADDED",
      title: "আইডিয়ার দলে যুক্ত হয়েছেন",
      body: `${idea.title} — আপনি দলে যুক্ত হয়েছেন (নীতিগতভাবে সম্মত)।`,
      payload: { route: `/ideas/${ideaId}`, ideaId },
      dedupeKey: `idea-team:${ideaId}:${request.requester_user_id}`,
    });
    return this.members(ownerUserId, ideaId);
  }

  /** The owner removes someone, or a member leaves. */
  async remove(actorUserId: string, ideaId: string, memberUserId: string) {
    const relation = await this.ideas.relationOr404(actorUserId, ideaId);
    if (relation !== "OWNER" && actorUserId !== memberUserId)
      throw ideaErrors.notFound();
    if (!isTeam(relation)) throw ideaErrors.notFound();
    const member = await this.prisma.ideaMember.findUnique({
      where: { idea_id_user_id: { idea_id: ideaId, user_id: memberUserId } },
    });
    if (!member) throw ideaErrors.notFound();
    await this.prisma.ideaMember.delete({ where: { id: member.id } });
    await this.syncRoom(ideaId);
    await this.ideas.audit(actorUserId, "IDEA_MEMBER_REMOVED", ideaId, {
      userId: memberUserId,
    });
    return { ideaId, userId: memberUserId, removed: true };
  }

  /**
   * Launch: the idea becomes a business profile (INFORMAL or REGISTERED)
   * owned by the idea's owner; the team is invited as staff (they accept).
   */
  async convert(ownerUserId: string, ideaId: string, input: ConvertIdeaDto) {
    const idea = await this.ideas.load(ideaId);
    if (idea.stage === IdeaStage.CONVERTED || idea.converted_business_id)
      throw ideaErrors.alreadyConverted();
    const owned = await this.prisma.businessMember.count({
      where: {
        user_id: ownerUserId,
        role: BusinessMemberRole.OWNER,
        accepted_at: { not: null },
        business: { deleted_at: null },
      },
    });
    if (owned >= MAX_OWNED_BUSINESSES) throw businessErrors.limitReached();
    const team = await this.prisma.ideaMember.findMany({
      where: { idea_id: ideaId },
      select: { user_id: true },
    });
    const now = new Date();
    const businessId = await this.prisma.$transaction(async (transaction) => {
      const business = await transaction.businessProfile.create({
        data: {
          user_id: ownerUserId,
          business_name: input.name?.trim() || idea.title,
          stage:
            input.stage === BusinessStage.REGISTERED
              ? BusinessStage.REGISTERED
              : BusinessStage.INFORMAL,
          description: idea.summary,
          category_id: idea.category.id,
          location_id: idea.location?.id ?? null,
          trade_licence_no: input.tradeLicenceNo?.trim() || null,
          members: {
            create: [
              {
                user_id: ownerUserId,
                role: BusinessMemberRole.OWNER,
                accepted_at: now,
              },
              ...team.map((member) => ({
                user_id: member.user_id,
                role: BusinessMemberRole.STAFF,
                invited_by_user_id: ownerUserId,
              })),
            ],
          },
        },
        select: { id: true },
      });
      const updated = await transaction.businessIdea.updateMany({
        where: { id: ideaId, converted_business_id: null },
        data: {
          stage: IdeaStage.CONVERTED,
          converted_at: now,
          converted_business_id: business.id,
        },
      });
      if (updated.count !== 1) throw ideaErrors.alreadyConverted();
      return business.id;
    });
    await this.ideas.audit(ownerUserId, "IDEA_CONVERTED", ideaId, {
      businessId,
      stage: input.stage,
    });
    for (const member of team)
      await this.notifications?.create({
        userId: member.user_id,
        type: "BUSINESS_INVITATION",
        title: "ব্যবসায় যোগ দেওয়ার আমন্ত্রণ",
        body: `${idea.title} এখন একটি ব্যবসা। দলে যোগ দিতে আমন্ত্রণ গ্রহণ করুন।`,
        payload: { route: `/businesses/${businessId}`, businessId },
        dedupeKey: `business-invite:${businessId}:${member.user_id}`,
      });
    return {
      idea: await this.ideas.get(ownerUserId, ideaId),
      business: await this.businesses.get(ownerUserId, businessId),
    };
  }
}
