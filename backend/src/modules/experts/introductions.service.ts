import { Injectable, Optional } from "@nestjs/common";
import {
  IdeaAccessStatus,
  IntroductionContextType,
  IntroductionStatus,
  MentorStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";

import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ideaRelation, isTeam } from "../ideas/idea-visibility";
import { NotificationsService } from "../notifications/notifications.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { visibleDisplayName } from "../users/public-profile.projection";
import {
  AcceptIntroductionDto,
  CreateIntroductionDto,
  DeclineIntroductionDto,
  IntroductionListQueryDto,
} from "./dto/introduction.dto";
import { introductionErrors } from "./introductions.errors";

const DAILY_LIMIT = 5;
const DAY_MS = 86_400_000;
const EXPIRES_MS = 7 * DAY_MS;

type Action = "ACCEPT" | "DECLINE" | "WITHDRAW";

/** Names only: never a phone number or email. */
const personSelect = {
  id: true,
  profile: {
    select: {
      display_name: true,
      show_full_name: true,
      trust_level: true,
      mentor_bio: true,
    },
  },
} satisfies Prisma.UserSelect;

const include = {
  requester: { select: personSelect },
  target: { select: personSelect },
} satisfies Prisma.IntroductionRequestInclude;

type Row = Prisma.IntroductionRequestGetPayload<{ include: typeof include }>;

/**
 * P3.1: consent-based introductions to experts (approved mentors who take
 * requests). The requester shares only a public summary of an idea, a
 * business or a learning goal. The expert accepts (an in-app conversation
 * opens; idea access only if the owner offered it and the expert accepted
 * the confidentiality notice), declines, or lets it expire after 7 days.
 * Blocks and `discoverable` are respected; 5 requests a day; one pending
 * request per requester and expert.
 */
@Injectable()
export class IntroductionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly userBlocks?: UserBlocksService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  async create(userId: string, input: CreateIntroductionDto) {
    if (input.expertUserId === userId) throw introductionErrors.notFound();
    await this.assertExpert(userId, input.expertUserId);
    const context = await this.context(userId, input);
    await this.assertDailyLimit(userId);
    const now = new Date();
    const created = await this.prisma.introductionRequest
      .create({
        data: {
          requester_user_id: userId,
          target_user_id: input.expertUserId,
          context_type: input.contextType,
          context_id: context.id,
          context_summary: context.summary,
          message: input.message.trim(),
          allow_idea_access: context.allowIdeaAccess,
          expires_at: new Date(now.getTime() + EXPIRES_MS),
        },
        select: { id: true },
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw introductionErrors.alreadyPending();
        throw error;
      });
    await this.notifications?.create({
      userId: input.expertUserId,
      type: "INTRODUCTION_REQUEST",
      title: "নতুন পরিচয়ের অনুরোধ",
      body: "কেউ আপনার সাথে পরিচিত হতে চান। ৭ দিনের মধ্যে উত্তর দিন।",
      payload: {
        route: `/introductions/${created.id}`,
        introductionId: created.id,
      },
      dedupeKey: `introduction:${created.id}`,
    });
    return this.get(userId, created.id);
  }

  async list(userId: string, query: IntroductionListQueryDto) {
    await this.expireDue();
    const limit = query.limit ?? 20;
    const hidden = await this.blocks.hiddenFrom(userId);
    const box = query.box ?? "all";
    const sent = {
      requester_user_id: userId,
      target_user_id: { notIn: hidden },
    };
    const received = {
      target_user_id: userId,
      requester_user_id: { notIn: hidden },
    };
    const rows = await this.prisma.introductionRequest.findMany({
      where: {
        hidden_at: null,
        ...(query.status ? { status: query.status } : {}),
        ...(box === "sent"
          ? sent
          : box === "received"
            ? received
            : { OR: [sent, received] }),
      },
      include,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    return {
      items: page.items.map((row) => this.serialize(row, userId)),
      nextCursor: page.nextCursor,
    };
  }

  async get(userId: string, id: string) {
    const row = await this.participantRow(userId, id);
    return this.serialize(row, userId);
  }

  async act(
    userId: string,
    id: string,
    action: Action,
    input: AcceptIntroductionDto & DeclineIntroductionDto = {},
  ) {
    const row = await this.participantRow(userId, id);
    if (!this.actions(row, userId).includes(action))
      throw introductionErrors.transition(
        row.status,
        this.actions(row, userId),
      );
    const now = new Date();
    let ideaAccessGranted = false;
    await this.prisma.$transaction(async (transaction) => {
      const data: Prisma.IntroductionRequestUncheckedUpdateManyInput = {
        decided_at: now,
      };
      if (action === "ACCEPT") {
        const conversation = await transaction.conversation.create({
          data: {
            scope_key: `introduction:${id}`,
            participants: {
              create: [
                { user_id: row.requester_user_id },
                { user_id: row.target_user_id },
              ],
            },
          },
          select: { id: true },
        });
        data.status = IntroductionStatus.ACCEPTED;
        data.conversation_id = conversation.id;
        if (
          row.allow_idea_access &&
          row.context_id &&
          input.acceptConfidentiality === true &&
          (await ideaRelation(
            transaction,
            row.requester_user_id,
            row.context_id,
          )) === "OWNER"
        ) {
          const access = {
            status: IdeaAccessStatus.APPROVED,
            message: "Granted with an accepted introduction.",
            confidentiality_accepted_at: now,
            approved_by_user_id: row.requester_user_id,
            approved_at: now,
            decided_at: now,
            revoked_at: null,
          };
          await transaction.ideaAccess.upsert({
            where: {
              idea_id_user_id: {
                idea_id: row.context_id,
                user_id: row.target_user_id,
              },
            },
            create: {
              idea_id: row.context_id,
              user_id: row.target_user_id,
              ...access,
            },
            update: access,
          });
          data.idea_access_granted = true;
          ideaAccessGranted = true;
        }
      } else if (action === "DECLINE") {
        data.status = IntroductionStatus.DECLINED;
        data.decline_reason = input.reason?.trim() || null;
      } else {
        data.status = IntroductionStatus.WITHDRAWN;
      }
      const updated = await transaction.introductionRequest.updateMany({
        where: { id, status: IntroductionStatus.PENDING },
        data,
      });
      if (updated.count !== 1)
        throw introductionErrors.transition(row.status, []);
    });
    if (action !== "WITHDRAW")
      await this.notifications?.create({
        userId: row.requester_user_id,
        type:
          action === "ACCEPT"
            ? "INTRODUCTION_ACCEPTED"
            : "INTRODUCTION_DECLINED",
        title:
          action === "ACCEPT"
            ? "পরিচয়ের অনুরোধ গৃহীত"
            : "পরিচয়ের অনুরোধের উত্তর",
        body:
          action === "ACCEPT"
            ? ideaAccessGranted
              ? "বিশেষজ্ঞ রাজি হয়েছেন এবং আপনার আইডিয়া দেখতে পারবেন। এখন বার্তায় কথা বলুন।"
              : "বিশেষজ্ঞ রাজি হয়েছেন। এখন বার্তায় কথা বলুন।"
            : "বিশেষজ্ঞ এবার অনুরোধ গ্রহণ করতে পারেননি।",
        payload: { route: `/introductions/${id}`, introductionId: id },
        dedupeKey: `introduction-${action}:${id}`,
      });
    return this.get(userId, id);
  }

  /** Pending requests past their 7 days become EXPIRED (the runner calls this). */
  async expireDue(now = new Date()) {
    const due = await this.prisma.introductionRequest.findMany({
      where: { status: IntroductionStatus.PENDING, expires_at: { lte: now } },
      select: { id: true, requester_user_id: true },
      take: 500,
    });
    if (!due.length) return { expired: 0 };
    const updated = await this.prisma.introductionRequest.updateMany({
      where: {
        id: { in: due.map((row) => row.id) },
        status: IntroductionStatus.PENDING,
      },
      data: { status: IntroductionStatus.EXPIRED, decided_at: now },
    });
    for (const row of due)
      await this.notifications?.create({
        userId: row.requester_user_id,
        type: "INTRODUCTION_EXPIRED",
        title: "পরিচয়ের অনুরোধের মেয়াদ শেষ",
        body: "৭ দিনে উত্তর না আসায় অনুরোধটি বন্ধ হয়েছে। চাইলে অন্য বিশেষজ্ঞকে অনুরোধ করুন।",
        payload: { route: `/introductions/${row.id}`, introductionId: row.id },
        dedupeKey: `introduction-expired:${row.id}`,
      });
    return { expired: updated.count };
  }

  private actions(row: Row, viewerUserId: string): Action[] {
    if (row.status !== IntroductionStatus.PENDING) return [];
    return row.target_user_id === viewerUserId
      ? ["ACCEPT", "DECLINE"]
      : ["WITHDRAW"];
  }

  private async participantRow(userId: string, id: string): Promise<Row> {
    const row = await this.prisma.introductionRequest.findFirst({
      where: {
        id,
        hidden_at: null,
        OR: [{ requester_user_id: userId }, { target_user_id: userId }],
      },
      include,
    });
    if (!row) throw introductionErrors.notFound();
    const other =
      row.requester_user_id === userId
        ? row.target_user_id
        : row.requester_user_id;
    if (await this.blocks.between(userId, other))
      throw introductionErrors.notFound();
    if (
      row.status === IntroductionStatus.PENDING &&
      row.expires_at <= new Date()
    ) {
      await this.expireDue();
      return this.participantRow(userId, id);
    }
    return row;
  }

  private serialize(row: Row, viewerUserId: string) {
    const isRequester = row.requester_user_id === viewerUserId;
    const accepted = row.status === IntroductionStatus.ACCEPTED;
    const person = (user: Row["requester"], expert: boolean) => ({
      userId: user.id,
      displayName: visibleDisplayName(user.profile?.display_name ?? "", {
        showFullName: user.profile?.show_full_name ?? false,
        hired: accepted,
      }),
      trustLevel: user.profile?.trust_level ?? "NONE",
      ...(expert ? { bio: user.profile?.mentor_bio ?? null } : {}),
    });
    return {
      id: row.id,
      status: row.status,
      role: isRequester ? "REQUESTER" : "EXPERT",
      requester: person(row.requester, false),
      expert: person(row.target, true),
      context: {
        type: row.context_type,
        // The expert learns which idea or business only once connected.
        id: isRequester || accepted ? row.context_id : null,
        summary: row.context_summary,
      },
      message: row.message,
      allowIdeaAccess: row.allow_idea_access,
      ideaAccessGranted: row.idea_access_granted,
      conversationId: accepted ? row.conversation_id : null,
      allowedActions: this.actions(row, viewerUserId),
      expiresAt: row.expires_at.toISOString(),
      decidedAt: row.decided_at?.toISOString() ?? null,
      declineReason: isRequester ? row.decline_reason : null,
      createdAt: row.created_at.toISOString(),
    };
  }

  /** An approved mentor taking requests, discoverable, active, not blocked. */
  private async assertExpert(userId: string, expertUserId: string) {
    const expert = await this.prisma.user.findFirst({
      where: {
        id: expertUserId,
        status: UserStatus.ACTIVE,
        deleted_at: null,
        profile: {
          mentor_status: MentorStatus.APPROVED,
          mentor_accepting: true,
          discoverable: true,
        },
      },
      select: { id: true },
    });
    if (!expert || (await this.blocks.between(userId, expertUserId)))
      throw introductionErrors.notFound();
  }

  /** The context, as the public summary the expert will see. */
  private async context(userId: string, input: CreateIntroductionDto) {
    if (input.contextType === IntroductionContextType.LEARNING_GOAL) {
      if (input.allowIdeaAccess) throw introductionErrors.ideaAccessOwnerOnly();
      return {
        id: null,
        summary: input.learningGoal!.trim(),
        allowIdeaAccess: false,
      };
    }
    if (input.contextType === IntroductionContextType.IDEA) {
      const relation = await ideaRelation(
        this.prisma,
        userId,
        input.contextId!,
      );
      // Your own idea, or one whose team you are on.
      if (!isTeam(relation)) throw introductionErrors.notFound();
      if (input.allowIdeaAccess && relation !== "OWNER")
        throw introductionErrors.ideaAccessOwnerOnly();
      const idea = await this.prisma.businessIdea.findUniqueOrThrow({
        where: { id: input.contextId! },
        select: { title: true, summary: true },
      });
      return {
        id: input.contextId!,
        summary: `${idea.title} — ${idea.summary}`,
        allowIdeaAccess: input.allowIdeaAccess ?? false,
      };
    }
    if (input.allowIdeaAccess) throw introductionErrors.ideaAccessOwnerOnly();
    const business = await this.prisma.businessProfile.findFirst({
      where: {
        id: input.contextId!,
        deleted_at: null,
        members: { some: { user_id: userId, accepted_at: { not: null } } },
      },
      select: { business_name: true, description: true },
    });
    if (!business) throw introductionErrors.notFound();
    const description = business.description?.trim();
    return {
      id: input.contextId!,
      summary: description
        ? `${business.business_name} — ${description.slice(0, 200)}`
        : business.business_name,
      allowIdeaAccess: false,
    };
  }

  private async assertDailyLimit(userId: string) {
    const since = new Date(Date.now() - DAY_MS);
    const recent = await this.prisma.introductionRequest.findMany({
      where: { requester_user_id: userId, created_at: { gte: since } },
      orderBy: { created_at: "asc" },
      select: { created_at: true },
      take: DAILY_LIMIT,
    });
    if (recent.length < DAILY_LIMIT) return;
    throw introductionErrors.dailyLimit(
      Math.max(
        1,
        Math.ceil(
          (recent[0]!.created_at.getTime() + DAY_MS - Date.now()) / 1000,
        ),
      ),
    );
  }
}
