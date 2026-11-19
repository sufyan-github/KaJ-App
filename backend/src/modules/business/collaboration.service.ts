import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
} from "@nestjs/common";
import {
  BusinessMemberRole,
  CollaborationStatus,
  CollaborationSubjectType,
  Prisma,
} from "@prisma/client";

import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { RateLimitException } from "../../common/errors/rate-limit.exception";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { maskContactDetails } from "../chat/chat-safety";
import { NotificationsService } from "../notifications/notifications.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { visibleDisplayName } from "../users/public-profile.projection";
import { businessErrors } from "./business.errors";
import { PUBLIC_BUSINESS } from "./business-labels";
import {
  CollaborationActionDto,
  CollaborationListQueryDto,
  CreateCollaborationRequestDto,
} from "./dto/collaboration.dto";

/** Shown on every collaboration screen: connecting is not a partnership. */
export const COLLABORATION_NOTICE = {
  key: "collaboration.notice.not_legal_partnership",
  en: "KAAJ only connects people. Connecting here does not create ownership, equity or a legal partnership. Put any agreement in writing yourselves.",
  bn: "KAAJ শুধু মানুষকে যুক্ত করে। এখানে যুক্ত হওয়া কোনো মালিকানা, শেয়ার বা আইনি অংশীদারত্ব তৈরি করে না। যেকোনো চুক্তি নিজেরা লিখিতভাবে করুন।",
} as const;

const DAILY_LIMIT = 10;
const DAY_MS = 86_400_000;
const OPEN: CollaborationStatus[] = [
  CollaborationStatus.PROPOSED,
  CollaborationStatus.ACCEPTED,
  CollaborationStatus.AGREED,
];

type Action = "ACCEPT" | "DECLINE" | "WITHDRAW" | "AGREE" | "END";

/** Who may move a request where (R = requester, C = recipient). */
const TRANSITIONS: Record<
  Action,
  {
    from: CollaborationStatus[];
    by: Array<"R" | "C">;
    to: CollaborationStatus;
  }
> = {
  ACCEPT: { from: ["PROPOSED"], by: ["C"], to: "ACCEPTED" },
  DECLINE: { from: ["PROPOSED"], by: ["C"], to: "DECLINED" },
  // The requester can withdraw a proposal; either side can step back from
  // an accepted one before agreeing.
  WITHDRAW: { from: ["PROPOSED", "ACCEPTED"], by: ["R", "C"], to: "WITHDRAWN" },
  AGREE: { from: ["ACCEPTED"], by: ["R", "C"], to: "AGREED" },
  END: { from: ["AGREED"], by: ["R", "C"], to: "ENDED" },
};

function allowed(
  action: Action,
  status: CollaborationStatus,
  side: "R" | "C",
): boolean {
  const rule = TRANSITIONS[action];
  // A proposal is the requester's to withdraw; the recipient declines it.
  if (action === "WITHDRAW" && status === "PROPOSED" && side === "C")
    return false;
  return rule.from.includes(status) && rule.by.includes(side);
}

/** What a subject resolves to for a request about it. */
export interface CollaborationSubject {
  recipientUserId: string;
  title: string;
  summary: string | null;
  /** Set when the request is about one role an idea seeks (P2.8). */
  ideaRoleId?: string | null;
}

/** Resolves IDEA subjects (registered by the ideas module, P2.7). */
export interface IdeaSubjectResolver {
  resolveForRequest(
    requesterUserId: string,
    ideaId: string,
    ideaRoleId?: string,
  ): Promise<CollaborationSubject>;
  describe(
    ideaId: string,
  ): Promise<{ title: string; summary: string | null } | null>;
}

const requestInclude = {
  requester: {
    select: {
      id: true,
      profile: { select: { display_name: true, show_full_name: true } },
    },
  },
  recipient: {
    select: {
      id: true,
      profile: { select: { display_name: true, show_full_name: true } },
    },
  },
  from_business: { select: { id: true, business_name: true } },
} satisfies Prisma.CollaborationRequestInclude;

type RequestRow = Prisma.CollaborationRequestGetPayload<{
  include: typeof requestInclude;
}>;

/**
 * P2.5: proposals to work together on an idea or a business.
 * PROPOSED → ACCEPTED | DECLINED | WITHDRAWN; ACCEPTED → AGREED (both
 * confirm) | WITHDRAWN; AGREED → ENDED. Accepting opens a conversation;
 * every change is kept in the request's history. 10 new requests per user
 * per day.
 */
@Injectable()
export class CollaborationService {
  private ideas?: IdeaSubjectResolver;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly userBlocks?: UserBlocksService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  /** The ideas module plugs in its subject resolver. */
  registerIdeaResolver(resolver: IdeaSubjectResolver) {
    this.ideas = resolver;
  }

  async create(userId: string, input: CreateCollaborationRequestDto) {
    await this.assertWithinDailyLimit(userId);
    const subject = await this.resolveSubject(userId, input);
    if (subject.recipientUserId === userId)
      throw new ConflictException({
        code: "OWN_SUBJECT",
        message: "You can't send a collaboration request to yourself.",
        messageKey: "error.collaboration.own_subject",
      });
    if (input.fromBusinessId)
      await this.assertOwnBusiness(userId, input.fromBusinessId);
    const id = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.collaborationRequest
        .create({
          data: {
            requester_user_id: userId,
            recipient_user_id: subject.recipientUserId,
            subject_type: input.subjectType,
            subject_id: input.subjectId,
            idea_role_id: subject.ideaRoleId ?? null,
            from_business_profile_id: input.fromBusinessId ?? null,
            message: input.message.trim(),
          },
          select: { id: true },
        })
        .catch((error: unknown) => {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
            throw new ConflictException({
              code: "COLLABORATION_ALREADY_OPEN",
              message: "You already have an open request about this.",
              messageKey: "error.collaboration.already_open",
            });
          throw error;
        });
      await transaction.collaborationRequestEvent.create({
        data: {
          request_id: created.id,
          actor_user_id: userId,
          from_status: null,
          to_status: CollaborationStatus.PROPOSED,
        },
      });
      return created.id;
    });
    await this.notify(subject.recipientUserId, id, "COLLABORATION_REQUEST", {
      title: "নতুন সহযোগিতার প্রস্তাব",
      body: `${subject.title} — কেউ একসাথে কাজ করার প্রস্তাব পাঠিয়েছেন।`,
    });
    return this.get(userId, id);
  }

  async list(userId: string, query: CollaborationListQueryDto) {
    const limit = query.limit ?? 20;
    const hidden = await this.blocks.hiddenFrom(userId);
    const box = query.box ?? "all";
    const where: Prisma.CollaborationRequestWhereInput = {
      hidden_at: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.subjectType ? { subject_type: query.subjectType } : {}),
      ...(query.subjectId ? { subject_id: query.subjectId } : {}),
      ...(box === "sent"
        ? { requester_user_id: userId, recipient_user_id: { notIn: hidden } }
        : box === "received"
          ? { recipient_user_id: userId, requester_user_id: { notIn: hidden } }
          : {
              OR: [
                {
                  requester_user_id: userId,
                  recipient_user_id: { notIn: hidden },
                },
                {
                  recipient_user_id: userId,
                  requester_user_id: { notIn: hidden },
                },
              ],
            }),
    };
    const rows = await this.prisma.collaborationRequest.findMany({
      where,
      include: requestInclude,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    const subjects = await this.describeSubjects(page.items);
    return {
      notice: COLLABORATION_NOTICE,
      items: page.items.map((row) =>
        this.serialize(row, userId, subjects.get(row.subject_id) ?? null),
      ),
      nextCursor: page.nextCursor,
    };
  }

  async get(userId: string, id: string) {
    const row = await this.participantRequest(userId, id);
    const [subjects, events] = await Promise.all([
      this.describeSubjects([row]),
      this.prisma.collaborationRequestEvent.findMany({
        where: { request_id: id },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      }),
    ]);
    return {
      ...this.serialize(row, userId, subjects.get(row.subject_id) ?? null),
      history: events.map((event) => ({
        fromStatus: event.from_status,
        toStatus: event.to_status,
        by:
          event.actor_user_id === null
            ? "KAAJ"
            : event.actor_user_id === userId
              ? "ME"
              : "THEM",
        note: event.note,
        at: event.created_at.toISOString(),
      })),
    };
  }

  async act(
    userId: string,
    id: string,
    action: Action,
    input: CollaborationActionDto = {},
  ) {
    const row = await this.participantRequest(userId, id);
    const side = row.requester_user_id === userId ? "R" : "C";
    const rule = TRANSITIONS[action];
    if (!allowed(action, row.status, side))
      throw new ConflictException({
        code: "COLLABORATION_TRANSITION_NOT_ALLOWED",
        message: `Can't ${action.toLowerCase()} a ${row.status.toLowerCase()} request.`,
        messageKey: "error.collaboration.transition_not_allowed",
        details: [
          { status: row.status, allowedActions: this.actions(row, userId) },
        ],
      });
    const otherUserId =
      side === "R" ? row.recipient_user_id : row.requester_user_id;
    const now = new Date();
    const note = input.note?.trim() || null;

    await this.prisma.$transaction(async (transaction) => {
      let data: Prisma.CollaborationRequestUncheckedUpdateInput;
      let to: CollaborationStatus = rule.to;
      switch (action) {
        case "ACCEPT": {
          const conversation = await transaction.conversation.create({
            data: {
              scope_key: `collaboration:${id}`,
              participants: {
                create: [
                  { user_id: row.requester_user_id },
                  { user_id: row.recipient_user_id },
                ],
              },
            },
            select: { id: true },
          });
          data = { conversation_id: conversation.id, decided_at: now };
          break;
        }
        case "DECLINE":
          data = { decided_at: now, closed_at: now };
          break;
        case "WITHDRAW":
        case "END":
          data = { closed_at: now };
          break;
        case "AGREE": {
          const summary = input.summary?.trim() || null;
          const summaryChanged =
            summary !== null && summary !== row.agreement_summary;
          const mine =
            side === "R" ? "requester_agreed_at" : "recipient_agreed_at";
          const theirs =
            side === "R" ? "recipient_agreed_at" : "requester_agreed_at";
          // A changed summary needs the other side to confirm again.
          const theirAgreement = summaryChanged ? null : row[theirs];
          data = {
            [mine]: now,
            [theirs]: theirAgreement,
            ...(summary !== null ? { agreement_summary: summary } : {}),
          };
          if (theirAgreement) data.agreed_at = now;
          else to = CollaborationStatus.ACCEPTED;
          break;
        }
      }
      const updated = await transaction.collaborationRequest.updateMany({
        where: { id, status: row.status },
        data: {
          ...data,
          status: to,
        } as Prisma.CollaborationRequestUncheckedUpdateManyInput,
      });
      if (updated.count !== 1)
        throw new ConflictException({
          code: "COLLABORATION_TRANSITION_NOT_ALLOWED",
          message: "The request changed meanwhile. Reload it.",
          messageKey: "error.collaboration.transition_not_allowed",
        });
      await transaction.collaborationRequestEvent.create({
        data: {
          request_id: id,
          actor_user_id: userId,
          from_status: row.status,
          to_status: to,
          note: action === "AGREE" ? input.summary?.trim() || note : note,
        },
      });
    });

    const texts: Record<Action, { type: string; title: string; body: string }> =
      {
        ACCEPT: {
          type: "COLLABORATION_ACCEPTED",
          title: "প্রস্তাব গৃহীত হয়েছে",
          body: "আপনার সহযোগিতার প্রস্তাব গৃহীত হয়েছে। এখন বার্তায় আলোচনা করুন।",
        },
        DECLINE: {
          type: "COLLABORATION_DECLINED",
          title: "প্রস্তাবের উত্তর",
          body: "আপনার সহযোগিতার প্রস্তাব এবার গ্রহণ করা হয়নি।",
        },
        WITHDRAW: {
          type: "COLLABORATION_WITHDRAWN",
          title: "প্রস্তাব প্রত্যাহার",
          body: "একটি সহযোগিতার প্রস্তাব প্রত্যাহার করা হয়েছে।",
        },
        AGREE: {
          type: "COLLABORATION_AGREEMENT",
          title: "সমঝোতা নিশ্চিত করুন",
          body: "অন্য পক্ষ সমঝোতা নিশ্চিত করেছেন। আপনিও দেখে নিশ্চিত করুন।",
        },
        END: {
          type: "COLLABORATION_ENDED",
          title: "সহযোগিতা শেষ",
          body: "একটি সহযোগিতা শেষ করা হয়েছে।",
        },
      };
    const text = texts[action];
    await this.notify(otherUserId, id, text.type, text, now.getTime());
    return this.get(userId, id);
  }

  /** One request as the viewer sees it. */
  serialize(
    row: RequestRow,
    viewerUserId: string,
    subject: { title: string; summary: string | null } | null,
  ) {
    const isRequester = row.requester_user_id === viewerUserId;
    const connected = row.status !== "PROPOSED" && row.status !== "DECLINED";
    // API-8: no phone, e-mail or handle reaches the recipient before they
    // accept (the conversation opens then, too).
    const accepted =
      row.status === "ACCEPTED" ||
      row.status === "AGREED" ||
      row.status === "ENDED";
    const person = (user: RequestRow["requester"]) => ({
      userId: user.id,
      displayName: visibleDisplayName(user.profile?.display_name ?? "", {
        showFullName: user.profile?.show_full_name ?? false,
        hired: connected && row.status !== "WITHDRAWN",
      }),
    });
    const myAgreedAt = isRequester
      ? row.requester_agreed_at
      : row.recipient_agreed_at;
    const theirAgreedAt = isRequester
      ? row.recipient_agreed_at
      : row.requester_agreed_at;
    return {
      id: row.id,
      status: row.status,
      role: isRequester ? "REQUESTER" : "RECIPIENT",
      subject: {
        type: row.subject_type,
        id: row.subject_id,
        ideaRoleId: row.idea_role_id,
        title: subject?.title ?? null,
        summary: subject?.summary ?? null,
      },
      requester: person(row.requester),
      recipient: person(row.recipient),
      fromBusiness: row.from_business
        ? { id: row.from_business.id, name: row.from_business.business_name }
        : null,
      message:
        isRequester || accepted ? row.message : maskContactDetails(row.message),
      conversationId:
        row.status === "ACCEPTED" ||
        row.status === "AGREED" ||
        row.status === "ENDED"
          ? row.conversation_id
          : null,
      agreement: {
        summary: row.agreement_summary,
        agreedByMe: myAgreedAt !== null,
        agreedByThem: theirAgreedAt !== null,
        agreedAt: row.agreed_at?.toISOString() ?? null,
      },
      allowedActions: this.actions(row, viewerUserId),
      decidedAt: row.decided_at?.toISOString() ?? null,
      closedAt: row.closed_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      notice: COLLABORATION_NOTICE,
    };
  }

  private actions(
    row: Pick<
      RequestRow,
      | "status"
      | "requester_user_id"
      | "requester_agreed_at"
      | "recipient_agreed_at"
    >,
    viewerUserId: string,
  ): Action[] {
    const side = row.requester_user_id === viewerUserId ? "R" : "C";
    return (Object.keys(TRANSITIONS) as Action[]).filter((action) =>
      allowed(action, row.status, side),
    );
  }

  private async participantRequest(userId: string, id: string) {
    const row = await this.prisma.collaborationRequest.findFirst({
      where: {
        id,
        hidden_at: null,
        OR: [{ requester_user_id: userId }, { recipient_user_id: userId }],
      },
      include: requestInclude,
    });
    if (!row) throw businessErrors.notFound();
    const other =
      row.requester_user_id === userId
        ? row.recipient_user_id
        : row.requester_user_id;
    // A block hides the request from both sides.
    if (await this.blocks.between(userId, other))
      throw businessErrors.notFound();
    return row;
  }

  private async resolveSubject(
    requesterUserId: string,
    input: CreateCollaborationRequestDto,
  ): Promise<CollaborationSubject> {
    if (input.subjectType === CollaborationSubjectType.IDEA) {
      if (!this.ideas)
        throw new BadRequestException({
          code: "COLLABORATION_SUBJECT_UNSUPPORTED",
          message: "Requests about ideas are not available yet.",
          messageKey: "error.collaboration.subject_unsupported",
        });
      return this.ideas.resolveForRequest(
        requesterUserId,
        input.subjectId,
        input.ideaRoleId,
      );
    }
    if (input.ideaRoleId)
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "ideaRoleId is only for requests about an idea.",
        messageKey: "error.validation.failed",
        field: "ideaRoleId",
      });
    const business = await this.prisma.businessProfile.findFirst({
      where: { id: input.subjectId, ...PUBLIC_BUSINESS },
      include: {
        members: {
          where: { accepted_at: { not: null } },
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
          select: { user_id: true, role: true },
        },
      },
    });
    if (!business) throw businessErrors.notFound();
    const owners = business.members.filter(
      (member) => member.role === BusinessMemberRole.OWNER,
    );
    if (business.members.some((member) => member.user_id === requesterUserId))
      throw new ConflictException({
        code: "OWN_SUBJECT",
        message: "You are already part of this business.",
        messageKey: "error.collaboration.own_subject",
      });
    const hidden = new Set(await this.blocks.hiddenFrom(requesterUserId));
    if (!owners[0] || owners.some((owner) => hidden.has(owner.user_id)))
      throw businessErrors.notFound();
    return {
      recipientUserId: owners[0].user_id,
      title: business.business_name,
      summary: business.description,
    };
  }

  private async describeSubjects(
    rows: Array<{ subject_type: CollaborationSubjectType; subject_id: string }>,
  ) {
    const result = new Map<string, { title: string; summary: string | null }>();
    const businessIds = rows
      .filter((row) => row.subject_type === CollaborationSubjectType.BUSINESS)
      .map((row) => row.subject_id);
    if (businessIds.length) {
      const businesses = await this.prisma.businessProfile.findMany({
        where: { id: { in: businessIds } },
        select: { id: true, business_name: true, description: true },
      });
      for (const business of businesses)
        result.set(business.id, {
          title: business.business_name,
          summary: business.description,
        });
    }
    for (const row of rows)
      if (row.subject_type === CollaborationSubjectType.IDEA && this.ideas) {
        const described = await this.ideas.describe(row.subject_id);
        if (described) result.set(row.subject_id, described);
      }
    return result;
  }

  private async assertOwnBusiness(userId: string, businessId: string) {
    const member = await this.prisma.businessMember.count({
      where: {
        business_profile_id: businessId,
        user_id: userId,
        accepted_at: { not: null },
        role: { in: [BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER] },
        business: { deleted_at: null, suspended_at: null },
      },
    });
    if (!member)
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Choose one of your own businesses.",
        messageKey: "error.validation.failed",
        field: "fromBusinessId",
      });
  }

  private async assertWithinDailyLimit(userId: string) {
    const since = new Date(Date.now() - DAY_MS);
    const recent = await this.prisma.collaborationRequest.findMany({
      where: { requester_user_id: userId, created_at: { gte: since } },
      orderBy: { created_at: "asc" },
      select: { created_at: true },
      take: DAILY_LIMIT,
    });
    if (recent.length < DAILY_LIMIT) return;
    const retryAfter = Math.max(
      1,
      Math.ceil((recent[0]!.created_at.getTime() + DAY_MS - Date.now()) / 1000),
    );
    throw new RateLimitException(
      {
        action: null,
        code: "RATE_LIMITED",
        details: [],
        field: null,
        message:
          "You can send 10 collaboration requests a day. Try again later.",
        messageKey: "error.collaboration.daily_limit",
        retryable: true,
      },
      retryAfter,
    );
  }

  private notify(
    userId: string,
    requestId: string,
    type: string,
    text: { title: string; body: string },
    at = Date.now(),
  ) {
    return this.notifications?.create({
      userId,
      type,
      title: text.title,
      body: text.body,
      payload: {
        route: `/collaboration-requests/${requestId}`,
        collaborationRequestId: requestId,
      },
      dedupeKey: `collaboration:${requestId}:${type}:${at}`,
    });
  }
}

export { OPEN as OPEN_COLLABORATION_STATUSES };
