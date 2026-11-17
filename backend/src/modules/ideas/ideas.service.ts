import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import {
  IdeaAccessStatus,
  IdeaRoleStatus,
  IdeaStage,
  IdeaVisibility,
  Prisma,
  TrustLevel,
  UserStatus,
} from "@prisma/client";

import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { RateLimitException } from "../../common/errors/rate-limit.exception";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { visibleDisplayName } from "../users/public-profile.projection";
import { hasTrust } from "../verification/trust-level";
import {
  CreateIdeaDto,
  IdeaAccessListQueryDto,
  IdeaSearchQueryDto,
  IdeaViewsQueryDto,
  RequestIdeaAccessDto,
  UpdateIdeaDto,
} from "./dto/idea.dto";
import { ideaErrors } from "./ideas.errors";
import {
  canSeeDetails,
  CONFIDENTIALITY_NOTICE,
  IdeaRelation,
  ideaRelation,
  ideaVisibilitySelect,
  isTeam,
} from "./idea-visibility";
import { serializeRole, roleInclude } from "./idea-roles.serializer";

const MAX_IDEAS = 20;
const ACCESS_DAILY_LIMIT = 10;
const DAY_MS = 86_400_000;

const STAGE_LABEL: Record<IdeaStage, { en: string; bn: string }> = {
  CONCEPT: { en: "Concept", bn: "ধারণা পর্যায়" },
  VALIDATING: { en: "Testing with customers", bn: "গ্রাহকদের সাথে যাচাই চলছে" },
  PILOT: { en: "Pilot", bn: "পরীক্ষামূলক চালু" },
  CONVERTED: { en: "Now a business", bn: "এখন একটি ব্যবসা" },
};

export const ideaInclude = {
  ...ideaVisibilitySelect,
  owner: {
    select: {
      status: true,
      deleted_at: true,
      profile: {
        select: {
          discoverable: true,
          display_name: true,
          show_full_name: true,
          trust_level: true,
        },
      },
    },
  },
  title: true,
  summary: true,
  problem: true,
  solution: true,
  details: true,
  stage: true,
  ai_consent: true,
  converted_business_id: true,
  converted_at: true,
  hidden_reason: true,
  created_at: true,
  updated_at: true,
  category: { select: { id: true, slug: true, name_en: true, name_bn: true } },
  location: { select: { id: true, name_en: true, name_bn: true } },
  roles: {
    include: roleInclude,
    orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
  },
  _count: { select: { members: true } },
} satisfies Prisma.BusinessIdeaSelect;

export type IdeaRow = Prisma.BusinessIdeaGetPayload<{
  select: typeof ideaInclude;
}>;

/** What anyone who may see the idea sees: never the private details. */
function summaryView(row: IdeaRow, relation: IdeaRelation) {
  const profile = row.owner.profile;
  const team = isTeam(relation);
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: {
      id: row.category.id,
      slug: row.category.slug,
      nameEn: row.category.name_en,
      nameBn: row.category.name_bn,
    },
    area: row.location
      ? {
          id: row.location.id,
          nameEn: row.location.name_en,
          nameBn: row.location.name_bn,
        }
      : null,
    stage: row.stage,
    stageLabel: STAGE_LABEL[row.stage],
    owner: {
      userId: row.owner_user_id,
      displayName: visibleDisplayName(profile?.display_name ?? "", {
        showFullName: profile?.show_full_name ?? false,
        hired: team,
      }),
      identityVerified: hasTrust(
        profile?.trust_level ?? TrustLevel.NONE,
        TrustLevel.IDENTITY,
      ),
    },
    // The team sees every role; others the open, unhidden ones.
    roles: row.roles
      .filter(
        (role) =>
          team || (role.status === IdeaRoleStatus.OPEN && !role.hidden_at),
      )
      .map(serializeRole),
    teamSize: row._count.members + 1,
    myRelation: relation === "SUMMARY" ? null : relation,
    canViewDetails: canSeeDetails(relation),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * P2.7: ideas. Private by default; at most a one-line summary is public,
 * and only after the owner verified their identity. Private details go to
 * the team and to people the owner approved (logged, revocable). Everyone
 * else gets 404 on every endpoint.
 */
@Injectable()
export class IdeasService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly userBlocks?: UserBlocksService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  /** The relation, or 404 when there is none. */
  async relationOr404(viewerUserId: string, ideaId: string) {
    const relation = await ideaRelation(this.prisma, viewerUserId, ideaId);
    if (!relation) throw ideaErrors.notFound();
    return relation;
  }

  async load(ideaId: string) {
    const row = await this.prisma.businessIdea.findUnique({
      where: { id: ideaId },
      select: ideaInclude,
    });
    if (!row || row.deleted_at) throw ideaErrors.notFound();
    return row;
  }

  async create(userId: string, input: CreateIdeaDto) {
    const count = await this.prisma.businessIdea.count({
      where: { owner_user_id: userId, deleted_at: null },
    });
    if (count >= MAX_IDEAS) throw ideaErrors.limitReached();
    await this.assertReferences(input.categoryId, input.locationId);
    if (input.visibility === IdeaVisibility.SUMMARY_PUBLIC)
      await this.assertIdentity(userId);
    const idea = await this.prisma.businessIdea.create({
      data: {
        owner_user_id: userId,
        title: input.title.trim(),
        summary: input.summary.trim(),
        problem: input.problem.trim(),
        solution: input.solution.trim(),
        details: input.details?.trim() || null,
        category_id: input.categoryId,
        location_id: input.locationId ?? null,
        stage: input.stage ?? IdeaStage.CONCEPT,
        visibility: input.visibility ?? IdeaVisibility.PRIVATE,
        ai_consent: input.aiConsent ?? false,
      },
      select: { id: true },
    });
    await this.audit(userId, "IDEA_CREATED", idea.id, {
      visibility: input.visibility ?? IdeaVisibility.PRIVATE,
    });
    return this.get(userId, idea.id);
  }

  /** My ideas (full) and the ideas I'm on the team of (summary cards). */
  async mine(userId: string) {
    const [owned, memberships] = await Promise.all([
      this.prisma.businessIdea.findMany({
        where: { owner_user_id: userId, deleted_at: null },
        select: ideaInclude,
        orderBy: [{ updated_at: "desc" }, { id: "desc" }],
      }),
      this.prisma.ideaMember.findMany({
        where: { user_id: userId, idea: { deleted_at: null, hidden_at: null } },
        select: { idea_id: true },
      }),
    ]);
    const team: ReturnType<typeof summaryView>[] = [];
    for (const { idea_id } of memberships) {
      const relation = await ideaRelation(this.prisma, userId, idea_id);
      if (relation === "MEMBER")
        team.push(summaryView(await this.load(idea_id), relation));
    }
    return {
      owned: owned.map((row) => this.ownerView(row)),
      team,
    };
  }

  /**
   * Search: public summaries only (never problem, solution or details),
   * of SUMMARY_PUBLIC ideas whose owner is active, discoverable and not in
   * a block with the viewer.
   */
  async search(viewerUserId: string, query: IdeaSearchQueryDto) {
    const limit = query.limit ?? 20;
    const hidden = await this.blocks.hiddenFrom(viewerUserId);
    const q = query.q?.trim();
    const rows = await this.prisma.businessIdea.findMany({
      where: {
        visibility: IdeaVisibility.SUMMARY_PUBLIC,
        hidden_at: null,
        deleted_at: null,
        stage: query.stage ?? { not: IdeaStage.CONVERTED },
        owner_user_id: { notIn: [viewerUserId, ...hidden] },
        owner: {
          status: UserStatus.ACTIVE,
          deleted_at: null,
          profile: { discoverable: true },
        },
        ...(query.categoryId
          ? {
              OR: [
                { category_id: query.categoryId },
                { category: { parent_id: query.categoryId } },
              ],
            }
          : {}),
        ...(query.locationId
          ? {
              location: {
                OR: [
                  { id: query.locationId },
                  { parent_id: query.locationId },
                  { parent: { parent_id: query.locationId } },
                ],
              },
            }
          : {}),
        ...(query.roleType
          ? {
              roles: {
                some: {
                  role_type: query.roleType,
                  status: IdeaRoleStatus.OPEN,
                  hidden_at: null,
                },
              },
            }
          : {}),
        ...(q
          ? {
              AND: [
                {
                  OR: [
                    { title: { contains: q, mode: "insensitive" } },
                    { summary: { contains: q, mode: "insensitive" } },
                  ],
                },
              ],
            }
          : {}),
      },
      select: ideaInclude,
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    const items = [];
    for (const row of page.items) {
      // Someone with access or on the team still only gets a card here.
      const relation = await ideaRelation(this.prisma, viewerUserId, row);
      if (relation) items.push(summaryView(row, relation));
    }
    return { items, nextCursor: page.nextCursor };
  }

  /**
   * One idea: the owner's full view; the team's and approved people's view
   * with the private details (logged); a summary card for a public idea;
   * otherwise 404.
   */
  async get(viewerUserId: string, ideaId: string) {
    const relation = await this.relationOr404(viewerUserId, ideaId);
    const row = await this.load(ideaId);
    if (relation === "OWNER") return this.ownerView(row);
    if (relation === "SUMMARY") {
      const access = await this.prisma.ideaAccess.findUnique({
        where: { idea_id_user_id: { idea_id: ideaId, user_id: viewerUserId } },
        select: { status: true, created_at: true },
      });
      return {
        ...summaryView(row, relation),
        myAccess: access
          ? {
              status: access.status,
              requestedAt: access.created_at.toISOString(),
            }
          : null,
      };
    }
    await this.prisma.ideaDetailView.create({
      data: { idea_id: ideaId, viewer_user_id: viewerUserId, basis: relation },
    });
    return {
      ...summaryView(row, relation),
      details: this.details(row),
      notice: CONFIDENTIALITY_NOTICE,
    };
  }

  async update(userId: string, ideaId: string, input: UpdateIdeaDto) {
    const current = await this.load(ideaId);
    await this.assertReferences(
      input.categoryId,
      input.locationId ?? undefined,
    );
    if (
      input.visibility === IdeaVisibility.SUMMARY_PUBLIC &&
      current.visibility !== IdeaVisibility.SUMMARY_PUBLIC
    )
      await this.assertIdentity(userId);
    if (current.stage === IdeaStage.CONVERTED && input.stage)
      throw ideaErrors.alreadyConverted();
    await this.prisma.businessIdea.update({
      where: { id: ideaId },
      data: {
        title: input.title?.trim(),
        summary: input.summary?.trim(),
        problem: input.problem?.trim(),
        solution: input.solution?.trim(),
        details:
          input.details === undefined
            ? undefined
            : input.details?.trim() || null,
        category_id: input.categoryId,
        location_id: input.locationId,
        stage: input.stage,
        visibility: input.visibility,
        ai_consent: input.aiConsent,
      },
    });
    await this.audit(userId, "IDEA_UPDATED", ideaId, {
      fields: Object.keys(input),
      visibility: input.visibility ?? current.visibility,
    });
    return this.get(userId, ideaId);
  }

  async remove(userId: string, ideaId: string) {
    await this.prisma.businessIdea.update({
      where: { id: ideaId },
      data: { deleted_at: new Date(), visibility: IdeaVisibility.PRIVATE },
    });
    await this.audit(userId, "IDEA_DELETED", ideaId, {});
    return { id: ideaId, deleted: true };
  }

  /** Ask the owner for the private details (confidentiality accepted). */
  async requestAccess(
    userId: string,
    ideaId: string,
    input: RequestIdeaAccessDto,
  ) {
    const relation = await this.relationOr404(userId, ideaId);
    if (relation !== "SUMMARY") throw ideaErrors.alreadyHasAccess();
    if (input.acceptConfidentiality !== true)
      throw ideaErrors.confidentialityRequired();
    const existing = await this.prisma.ideaAccess.findUnique({
      where: { idea_id_user_id: { idea_id: ideaId, user_id: userId } },
    });
    if (existing?.status === IdeaAccessStatus.REQUESTED)
      throw ideaErrors.alreadyRequested();
    if (existing?.status === IdeaAccessStatus.APPROVED)
      // Approved but the idea is MEMBERS-only right now.
      throw ideaErrors.alreadyHasAccess();
    await this.assertAccessRequestLimit(userId);
    const now = new Date();
    const data = {
      status: IdeaAccessStatus.REQUESTED,
      message: input.message?.trim() || null,
      confidentiality_accepted_at: now,
      approved_by_user_id: null,
      approved_at: null,
      decided_at: null,
      revoked_at: null,
    };
    await this.prisma.ideaAccess.upsert({
      where: { idea_id_user_id: { idea_id: ideaId, user_id: userId } },
      create: { idea_id: ideaId, user_id: userId, ...data },
      update: { ...data, created_at: now },
    });
    const idea = await this.load(ideaId);
    await this.notifications?.create({
      userId: idea.owner_user_id,
      type: "IDEA_ACCESS_REQUESTED",
      title: "আইডিয়ার বিস্তারিত দেখার অনুরোধ",
      body: `${idea.title} — কেউ বিস্তারিত দেখার অনুমতি চেয়েছেন।`,
      payload: { route: `/ideas/${ideaId}/access`, ideaId },
      dedupeKey: `idea-access:${ideaId}:${userId}:${now.getTime()}`,
    });
    return {
      ideaId,
      status: IdeaAccessStatus.REQUESTED,
      requestedAt: now.toISOString(),
      notice: CONFIDENTIALITY_NOTICE,
    };
  }

  /** The owner's list of who asked and who has access. */
  async accessList(ideaId: string, query: IdeaAccessListQueryDto) {
    const rows = await this.prisma.ideaAccess.findMany({
      where: {
        idea_id: ideaId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        user: {
          select: {
            profile: {
              select: {
                display_name: true,
                show_full_name: true,
                trust_level: true,
              },
            },
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 200,
    });
    return {
      items: rows.map((row) => ({
        userId: row.user_id,
        displayName: visibleDisplayName(row.user.profile?.display_name ?? "", {
          showFullName: row.user.profile?.show_full_name ?? false,
          hired: false,
        }),
        trustLevel: row.user.profile?.trust_level ?? TrustLevel.NONE,
        status: row.status,
        message: row.message,
        confidentialityAcceptedAt:
          row.confidentiality_accepted_at.toISOString(),
        requestedAt: row.created_at.toISOString(),
        approvedAt: row.approved_at?.toISOString() ?? null,
        decidedAt: row.decided_at?.toISOString() ?? null,
        revokedAt: row.revoked_at?.toISOString() ?? null,
      })),
    };
  }

  async decideAccess(
    ownerUserId: string,
    ideaId: string,
    userId: string,
    decision: "APPROVE" | "DECLINE" | "REVOKE",
  ) {
    const access = await this.prisma.ideaAccess.findUnique({
      where: { idea_id_user_id: { idea_id: ideaId, user_id: userId } },
    });
    if (!access) throw ideaErrors.notFound();
    const from =
      decision === "REVOKE"
        ? IdeaAccessStatus.APPROVED
        : IdeaAccessStatus.REQUESTED;
    if (access.status !== from) throw ideaErrors.accessTransition();
    if (
      decision === "APPROVE" &&
      (await this.blocks.between(ownerUserId, userId))
    )
      throw ideaErrors.notFound();
    const now = new Date();
    await this.prisma.ideaAccess.update({
      where: { id: access.id },
      data:
        decision === "APPROVE"
          ? {
              status: IdeaAccessStatus.APPROVED,
              approved_by_user_id: ownerUserId,
              approved_at: now,
              decided_at: now,
            }
          : decision === "DECLINE"
            ? { status: IdeaAccessStatus.DECLINED, decided_at: now }
            : { status: IdeaAccessStatus.REVOKED, revoked_at: now },
    });
    await this.audit(ownerUserId, `IDEA_ACCESS_${decision}D`, ideaId, {
      userId,
    });
    if (decision !== "REVOKE") {
      const idea = await this.load(ideaId);
      await this.notifications?.create({
        userId,
        type:
          decision === "APPROVE"
            ? "IDEA_ACCESS_APPROVED"
            : "IDEA_ACCESS_DECLINED",
        title:
          decision === "APPROVE"
            ? "আইডিয়ার বিস্তারিত দেখার অনুমতি পেয়েছেন"
            : "আইডিয়ার অনুরোধের উত্তর",
        body:
          decision === "APPROVE"
            ? `${idea.title} — এখন বিস্তারিত দেখতে পারবেন। গোপনীয়তা বজায় রাখুন।`
            : `${idea.title} — এবার বিস্তারিত দেখার অনুমতি দেওয়া হয়নি।`,
        payload: { route: `/ideas/${ideaId}`, ideaId },
        dedupeKey: `idea-access-${decision}:${ideaId}:${userId}:${now.getTime()}`,
      });
    }
    return this.accessList(ideaId, {});
  }

  /** The access requests I made (titles only where I can still see the idea). */
  async myAccess(userId: string) {
    const rows = await this.prisma.ideaAccess.findMany({
      where: { user_id: userId, idea: { deleted_at: null } },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 200,
    });
    const items = [];
    for (const row of rows) {
      const relation = await ideaRelation(this.prisma, userId, row.idea_id);
      if (!relation) continue;
      const idea = await this.prisma.businessIdea.findUniqueOrThrow({
        where: { id: row.idea_id },
        select: { title: true, summary: true },
      });
      items.push({
        ideaId: row.idea_id,
        title: idea.title,
        summary: idea.summary,
        status: row.status,
        requestedAt: row.created_at.toISOString(),
        canViewDetails: canSeeDetails(relation),
      });
    }
    return { items };
  }

  /** The owner sees every view of the private details. */
  async views(ideaId: string, query: IdeaViewsQueryDto) {
    const limit = query.limit ?? 50;
    const rows = await this.prisma.ideaDetailView.findMany({
      where: { idea_id: ideaId },
      include: {
        viewer: {
          select: { profile: { select: { display_name: true } } },
        },
      },
      orderBy: [{ viewed_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        viewerUserId: row.viewer_user_id,
        displayName: row.viewer.profile?.display_name?.trim() ?? "",
        basis: row.basis,
        viewedAt: row.viewed_at.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  ownerView(row: IdeaRow) {
    return {
      ...summaryView(row, "OWNER"),
      details: this.details(row),
      visibility: row.visibility,
      aiConsent: row.ai_consent,
      convertedBusinessId: row.converted_business_id,
      convertedAt: row.converted_at?.toISOString() ?? null,
      status: row.hidden_at ? "HIDDEN" : "ACTIVE",
      hiddenReason: row.hidden_reason,
    };
  }

  private details(row: IdeaRow) {
    return {
      problem: row.problem,
      solution: row.solution,
      details: row.details,
    };
  }

  private async assertIdentity(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { trust_level: true },
    });
    if (!hasTrust(profile?.trust_level ?? TrustLevel.NONE, TrustLevel.IDENTITY))
      throw ideaErrors.identityRequired();
  }

  private async assertAccessRequestLimit(userId: string) {
    const since = new Date(Date.now() - DAY_MS);
    const recent = await this.prisma.ideaAccess.findMany({
      where: { user_id: userId, created_at: { gte: since } },
      orderBy: { created_at: "asc" },
      select: { created_at: true },
      take: ACCESS_DAILY_LIMIT,
    });
    if (recent.length < ACCESS_DAILY_LIMIT) return;
    throw new RateLimitException(
      {
        action: null,
        code: "RATE_LIMITED",
        details: [],
        field: null,
        message: "You can ask about 10 ideas a day. Try again later.",
        messageKey: "error.idea.daily_limit",
        retryable: true,
      },
      Math.max(
        1,
        Math.ceil(
          (recent[0]!.created_at.getTime() + DAY_MS - Date.now()) / 1000,
        ),
      ),
    );
  }

  private async assertReferences(categoryId?: string, locationId?: string) {
    const [category, location] = await Promise.all([
      categoryId
        ? this.prisma.businessCategory.count({
            where: { id: categoryId, is_active: true },
          })
        : 1,
      locationId
        ? this.prisma.location.count({
            where: { id: locationId, is_active: true },
          })
        : 1,
    ]);
    if (!category || !location)
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: category ? "Unknown area." : "Unknown business sector.",
        messageKey: "error.validation.failed",
        field: category ? "locationId" : "categoryId",
      });
  }

  audit(
    actorUserId: string,
    action: string,
    ideaId: string,
    after: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actor_user_id: actorUserId,
        action,
        entity: "BusinessIdea",
        entity_id: ideaId,
        after_json: after,
      },
    });
  }
}
