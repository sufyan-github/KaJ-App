import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import {
  Gender,
  GroupMemberRole,
  GroupMemberStatus,
  SessionSubjectType,
  IntroductionStatus,
  MentorStatus,
  Prisma,
  SessionKind,
  SessionMode,
  SessionParticipantRole,
  SessionParticipantStatus,
  SessionPriceModel,
  SessionStatus,
  UserStatus,
} from "@prisma/client";

import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AttendanceLocationDto } from "../attendance/dto/attendance.dto";
import { AttendanceService } from "../attendance/attendance.service";
import { AvailabilityService } from "../availability/availability.service";
import { ChatService } from "../chat/chat.service";
import { MentorsService } from "../mentors/mentors.service";
import { NotificationsService } from "../notifications/notifications.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { visibleDisplayName } from "../users/public-profile.projection";
import {
  BookConsultationDto,
  CancelSessionDto,
  CreateGroupSessionDto,
  CreateSessionDto,
  InviteSessionDto,
  RespondSessionDto,
  SessionAttendanceDto,
  SessionCashDto,
  SessionListQueryDto,
  UpdateSessionDto,
} from "./dto/session.dto";
import { sessionErrors } from "./sessions.errors";

const MINUTE = 60_000;
/** Places count accepted and attended participants (not the host). */
const TAKING_A_PLACE: SessionParticipantStatus[] = [
  SessionParticipantStatus.ACCEPTED,
  SessionParticipantStatus.ATTENDED,
];
/** Who may see the online link. */
const CONFIRMED: SessionParticipantStatus[] = [
  SessionParticipantStatus.ACCEPTED,
  SessionParticipantStatus.ATTENDED,
];
const OPEN: SessionStatus[] = [SessionStatus.DRAFT, SessionStatus.SCHEDULED];

const personSelect = {
  id: true,
  profile: { select: { display_name: true, show_full_name: true } },
} satisfies Prisma.UserSelect;

const include = {
  host: { select: personSelect },
  expert: { select: personSelect },
  location: { select: { id: true, name_en: true, name_bn: true } },
  participants: {
    include: { user: { select: personSelect } },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.SessionInclude;

type Row = Prisma.SessionGetPayload<{ include: typeof include }>;

/**
 * P3.2: sessions — consultations (one to one with an expert, booked in the
 * expert's free time), group discussions, workshops and events. Visible to
 * the host and the people on it only (404 otherwise); an online link only
 * to confirmed participants; in person means an area, never an address.
 * Cash sessions are recorded per participant; feedback is a SESSION review.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly mentors: MentorsService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly userBlocks?: UserBlocksService,
    @Optional() private readonly chat?: ChatService,
    @Optional() private readonly attendanceService?: AttendanceService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  /** An expert's free time for a consultation (their availability rules). */
  async expertSlots(
    viewerUserId: string,
    expertUserId: string,
    from: string,
    to: string,
  ) {
    await this.assertExpert(viewerUserId, expertUserId);
    const range = this.range(from, to);
    const slots = await this.availability.freeSlots(
      expertUserId,
      range.from,
      range.to,
      await this.busyWindows(expertUserId, range.from, range.to),
    );
    return {
      expertUserId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      slots,
    };
  }

  /** Book a consultation: the expert gets an invitation to accept. */
  async bookConsultation(userId: string, input: BookConsultationDto) {
    if (input.expertUserId === userId) throw sessionErrors.notFound();
    await this.assertExpert(userId, input.expertUserId);
    if (input.introductionId) {
      const introduction = await this.prisma.introductionRequest.count({
        where: {
          id: input.introductionId,
          requester_user_id: userId,
          target_user_id: input.expertUserId,
          status: IntroductionStatus.ACCEPTED,
        },
      });
      if (!introduction) throw sessionErrors.notFound();
    }
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(
      startsAt.getTime() + input.durationMinutes * MINUTE,
    );
    if (startsAt.getTime() < Date.now() + 15 * MINUTE)
      throw sessionErrors.invalid(
        "startsAt",
        "Book at least 15 minutes ahead.",
      );
    await this.assertPlace(input.mode, input.locationId);
    // W4 (D-3): check and book under the expert's lock, so two people asking
    // for the same free time at once get one booking and one 409.
    const session = await this.prisma.$transaction(async (transaction) => {
      await this.lockExpert(transaction, input.expertUserId);
      const free = await this.availability.freeSlots(
        input.expertUserId,
        startsAt,
        endsAt,
        await this.busyWindows(
          input.expertUserId,
          startsAt,
          endsAt,
          transaction,
        ),
        transaction,
      );
      const fits = free.some(
        (slot) =>
          new Date(slot.startsAt).getTime() <= startsAt.getTime() &&
          new Date(slot.endsAt).getTime() >= endsAt.getTime(),
      );
      if (!fits) throw sessionErrors.slotUnavailable();
      return transaction.session.create({
        data: {
          host_user_id: input.expertUserId,
          expert_user_id: input.expertUserId,
          kind: SessionKind.CONSULTATION,
          title: input.title?.trim() || "Consultation",
          description: input.note?.trim() || null,
          starts_at: startsAt,
          duration_minutes: input.durationMinutes,
          mode: input.mode,
          location_id:
            input.mode === SessionMode.IN_PERSON ? input.locationId! : null,
          online_link: null,
          capacity: 1,
          introduction_id: input.introductionId ?? null,
          participants: {
            create: [
              {
                user_id: input.expertUserId,
                role: SessionParticipantRole.EXPERT,
                status: SessionParticipantStatus.INVITED,
                invited_by_user_id: userId,
              },
              {
                user_id: userId,
                role: SessionParticipantRole.PARTICIPANT,
                status: SessionParticipantStatus.ACCEPTED,
                responded_at: new Date(),
              },
            ],
          },
        },
        select: { id: true },
      });
    });
    await this.notify([input.expertUserId], session.id, "SESSION_INVITE", {
      title: "নতুন পরামর্শের অনুরোধ",
      body: "কেউ আপনার সাথে একটি পরামর্শ সেশন বুক করতে চান। গ্রহণ বা বাতিল করুন।",
    });
    return this.get(userId, session.id);
  }

  /** A group discussion, workshop or event, hosted by an approved mentor. */
  async create(userId: string, input: CreateSessionDto) {
    await this.mentors.assertApproved(userId);
    await this.assertPlace(input.mode, input.locationId);
    const price = this.price(input.priceModel, input.pricePoisha);
    if (input.womenOnly) await this.assertWoman(userId);
    if ((input.subjectType === undefined) !== (input.subjectId === undefined))
      throw sessionErrors.invalid(
        "subjectId",
        "Give both subjectType and subjectId, or neither.",
      );
    const startsAt = new Date(input.startsAt);
    if (startsAt.getTime() < Date.now())
      throw sessionErrors.invalid(
        "startsAt",
        "A session must start in the future.",
      );
    const session = await this.prisma.session.create({
      data: {
        host_user_id: userId,
        kind: input.kind,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        subject_type: input.subjectType ?? null,
        subject_id: input.subjectId ?? null,
        starts_at: startsAt,
        duration_minutes: input.durationMinutes,
        mode: input.mode,
        location_id:
          input.mode === SessionMode.IN_PERSON ? input.locationId! : null,
        online_link:
          input.mode === SessionMode.ONLINE ? (input.onlineLink ?? null) : null,
        capacity: input.capacity,
        ...price,
        women_only: input.womenOnly ?? false,
        home_based_friendly: input.homeBasedFriendly ?? false,
        participants: {
          create: {
            user_id: userId,
            role: SessionParticipantRole.HOST,
            status: SessionParticipantStatus.ACCEPTED,
            responded_at: new Date(),
          },
        },
      },
      select: { id: true },
    });
    return this.get(userId, session.id);
  }

  async update(userId: string, id: string, input: UpdateSessionDto) {
    const row = await this.hosted(userId, id);
    if (!OPEN.includes(row.status)) throw sessionErrors.transition(row.status);
    const mode = input.mode ?? row.mode;
    const locationId =
      input.locationId === undefined ? row.location_id : input.locationId;
    const onlineLink =
      input.onlineLink === undefined ? row.online_link : input.onlineLink;
    await this.assertPlace(mode, locationId ?? undefined);
    if (
      mode === SessionMode.ONLINE &&
      row.status === SessionStatus.SCHEDULED &&
      !onlineLink
    )
      throw sessionErrors.invalid(
        "onlineLink",
        "An online session needs a link.",
      );
    if (input.womenOnly && !row.women_only) await this.assertWoman(userId);
    const capacity = input.capacity ?? row.capacity;
    if (row.kind === SessionKind.CONSULTATION && capacity !== 1)
      throw sessionErrors.invalid("capacity", "A consultation is one to one.");
    if (capacity < this.placesTaken(row))
      throw sessionErrors.invalid(
        "capacity",
        "More people have already accepted.",
      );
    const price =
      input.priceModel !== undefined || input.pricePoisha !== undefined
        ? this.price(
            input.priceModel ?? row.price_model,
            input.pricePoisha === undefined
              ? row.price_poisha?.toString()
              : (input.pricePoisha ?? undefined),
          )
        : {};
    await this.prisma.session.update({
      where: { id },
      data: {
        title: input.title?.trim(),
        description:
          input.description === undefined
            ? undefined
            : input.description?.trim() || null,
        starts_at: input.startsAt ? new Date(input.startsAt) : undefined,
        duration_minutes: input.durationMinutes,
        mode,
        location_id: mode === SessionMode.IN_PERSON ? locationId : null,
        online_link: mode === SessionMode.ONLINE ? onlineLink : null,
        capacity,
        ...price,
        women_only: input.womenOnly,
        home_based_friendly: input.homeBasedFriendly,
      },
    });
    if (capacity > row.capacity) await this.promoteWaitlist(id);
    if (input.startsAt || input.mode || input.locationId !== undefined)
      await this.notify(
        this.confirmedIds(row).filter((user) => user !== userId),
        id,
        "SESSION_UPDATED",
        {
          title: "সেশনে পরিবর্তন",
          body: `${row.title} — সময় বা স্থান বদলেছে। দেখে নিন।`,
        },
      );
    return this.get(userId, id);
  }

  async publish(userId: string, id: string) {
    const row = await this.hosted(userId, id);
    if (
      row.status !== SessionStatus.DRAFT ||
      row.kind === SessionKind.CONSULTATION
    )
      throw sessionErrors.transition(row.status);
    if (row.mode === SessionMode.ONLINE && !row.online_link)
      throw sessionErrors.invalid(
        "onlineLink",
        "An online session needs a link.",
      );
    if (row.starts_at.getTime() < Date.now())
      throw sessionErrors.invalid(
        "startsAt",
        "A session must start in the future.",
      );
    await this.prisma.session.update({
      where: { id },
      data: { status: SessionStatus.SCHEDULED },
    });
    if (row.group_id) {
      const hidden = await this.blocks.hiddenFrom(row.host_user_id);
      const members = await this.prisma.communityGroupMember.findMany({
        where: {
          group_id: row.group_id,
          status: GroupMemberStatus.ACTIVE,
          user_id: { notIn: [row.host_user_id, ...hidden] },
        },
        select: { user_id: true },
      });
      await this.notify(
        members.map((member) => member.user_id),
        id,
        "SESSION_ANNOUNCED",
        {
          title: "দলে নতুন আয়োজন",
          body: `${row.title} — যোগ দিতে RSVP করুন।`,
        },
      );
    }
    await this.notify(
      row.participants
        .filter((item) => item.status === SessionParticipantStatus.INVITED)
        .map((item) => item.user_id),
      id,
      "SESSION_INVITE",
      {
        title: "সেশনে আমন্ত্রণ",
        body: `${row.title} — আপনাকে আমন্ত্রণ জানানো হয়েছে।`,
      },
    );
    return this.get(userId, id);
  }

  /** The host invites people; they answer with respond. */
  async invite(userId: string, id: string, input: InviteSessionDto) {
    const row = await this.hosted(userId, id);
    if (!OPEN.includes(row.status) || row.kind === SessionKind.CONSULTATION)
      throw sessionErrors.transition(row.status);
    const existing = new Set(row.participants.map((item) => item.user_id));
    const hidden = new Set(await this.blocks.hiddenFrom(userId));
    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: input.userIds.filter(
            (user) => !existing.has(user) && !hidden.has(user),
          ),
        },
        status: UserStatus.ACTIVE,
        deleted_at: null,
        ...(row.women_only ? { profile: { gender: Gender.FEMALE } } : {}),
      },
      select: { id: true },
    });
    if (users.length)
      await this.prisma.sessionParticipant.createMany({
        data: users.map((user) => ({
          session_id: id,
          user_id: user.id,
          role: SessionParticipantRole.PARTICIPANT,
          status: SessionParticipantStatus.INVITED,
          invited_by_user_id: userId,
        })),
        skipDuplicates: true,
      });
    if (row.status === SessionStatus.SCHEDULED)
      await this.notify(
        users.map((user) => user.id),
        id,
        "SESSION_INVITE",
        {
          title: "সেশনে আমন্ত্রণ",
          body: `${row.title} — আপনাকে আমন্ত্রণ জানানো হয়েছে।`,
        },
      );
    return {
      ...(await this.get(userId, id)),
      // People who are unknown, blocked, already on it or not eligible are skipped silently.
      invited: users.map((user) => user.id),
    };
  }

  /** Answer an invitation. For a consultation, the expert's yes schedules it. */
  async respond(userId: string, id: string, input: RespondSessionDto) {
    const row = await this.visible(userId, id);
    const mine = row.participants.find((item) => item.user_id === userId);
    if (
      !mine ||
      mine.status !== SessionParticipantStatus.INVITED ||
      !OPEN.includes(row.status)
    )
      throw sessionErrors.transition(row.status);
    const now = new Date();
    if (!input.accept) {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.sessionParticipant.update({
          where: { id: mine.id },
          data: {
            status: SessionParticipantStatus.DECLINED,
            responded_at: now,
          },
        });
        // An expert turning a consultation down cancels it.
        if (mine.role === SessionParticipantRole.EXPERT)
          await transaction.session.update({
            where: { id },
            data: {
              status: SessionStatus.CANCELLED,
              cancelled_at: now,
              cancel_reason: "The expert declined.",
            },
          });
      });
      if (mine.role === SessionParticipantRole.EXPERT)
        await this.notify(
          this.confirmedIds(row).filter((user) => user !== userId),
          id,
          "SESSION_DECLINED",
          {
            title: "পরামর্শ বাতিল",
            body: "বিশেষজ্ঞ এবার পরামর্শটি নিতে পারছেন না।",
          },
        );
      return this.get(userId, id);
    }
    if (row.women_only) await this.assertWoman(userId);
    if (mine.role === SessionParticipantRole.EXPERT) {
      if (
        row.mode === SessionMode.ONLINE &&
        !input.onlineLink &&
        !row.online_link
      )
        throw sessionErrors.invalid(
          "onlineLink",
          "Add the meeting link to accept.",
        );
      const price = this.price(input.priceModel, input.pricePoisha);
      await this.prisma.$transaction(async (transaction) => {
        // W4 (D-3): under the expert's lock, refuse a time they have
        // already said yes to (bookings made before the lock existed).
        await this.lockExpert(transaction, userId);
        if (await this.expertTaken(transaction, userId, row))
          throw sessionErrors.slotUnavailable();
        const answered = await transaction.sessionParticipant.updateMany({
          where: { id: mine.id, status: SessionParticipantStatus.INVITED },
          data: {
            status: SessionParticipantStatus.ACCEPTED,
            responded_at: now,
          },
        });
        if (answered.count !== 1) throw sessionErrors.transition(row.status);
        await transaction.session.update({
          where: { id },
          data: {
            status: SessionStatus.SCHEDULED,
            online_link:
              row.mode === SessionMode.ONLINE
                ? (input.onlineLink ?? row.online_link)
                : null,
            ...price,
          },
        });
      });
      await this.notify(
        this.confirmedIds(row).filter((user) => user !== userId),
        id,
        "SESSION_CONFIRMED",
        {
          title: "পরামর্শ নিশ্চিত",
          body: "বিশেষজ্ঞ আপনার পরামর্শ সেশন নিশ্চিত করেছেন।",
        },
      );
      return this.get(userId, id);
    }
    await this.prisma.$transaction(async (transaction) => {
      // Places are taken race-safely.
      await transaction.$executeRaw`SELECT id FROM sessions WHERE id = ${id}::uuid FOR UPDATE`;
      const taken = await transaction.sessionParticipant.count({
        where: {
          session_id: id,
          role: SessionParticipantRole.PARTICIPANT,
          status: { in: TAKING_A_PLACE },
        },
      });
      if (taken >= row.capacity) throw sessionErrors.full();
      await transaction.sessionParticipant.update({
        where: { id: mine.id },
        data: { status: SessionParticipantStatus.ACCEPTED, responded_at: now },
      });
    });
    await this.resyncChat(id);
    return this.get(userId, id);
  }

  /** A participant leaves; leaving a consultation cancels it. */
  async leave(userId: string, id: string) {
    const row = await this.visible(userId, id);
    const mine = row.participants.find((item) => item.user_id === userId);
    if (
      !mine ||
      mine.role === SessionParticipantRole.HOST ||
      !OPEN.includes(row.status) ||
      !(
        [
          SessionParticipantStatus.ACCEPTED,
          SessionParticipantStatus.INVITED,
          SessionParticipantStatus.WAITLISTED,
        ] as SessionParticipantStatus[]
      ).includes(mine.status)
    )
      throw sessionErrors.transition(row.status);
    if (row.kind === SessionKind.CONSULTATION)
      return this.cancel(
        userId,
        id,
        { reason: "The participant cancelled." },
        true,
      );
    await this.prisma.sessionParticipant.update({
      where: { id: mine.id },
      data: {
        status: SessionParticipantStatus.DECLINED,
        responded_at: new Date(),
      },
    });
    // A freed place goes to the next person on the waitlist.
    if (mine.status === SessionParticipantStatus.ACCEPTED)
      await this.promoteWaitlist(id);
    await this.resyncChat(id);
    return this.get(userId, id);
  }

  async cancel(
    userId: string,
    id: string,
    input: CancelSessionDto,
    byParticipant = false,
  ) {
    const row = byParticipant
      ? await this.visible(userId, id)
      : await this.hosted(userId, id);
    if (!OPEN.includes(row.status)) throw sessionErrors.transition(row.status);
    await this.prisma.session.update({
      where: { id },
      data: {
        status: SessionStatus.CANCELLED,
        cancelled_at: new Date(),
        cancel_reason: input.reason.trim(),
      },
    });
    await this.notify(
      row.participants
        .filter(
          (item) =>
            item.user_id !== userId &&
            item.status !== SessionParticipantStatus.DECLINED,
        )
        .map((item) => item.user_id),
      id,
      "SESSION_CANCELLED",
      {
        title: "সেশন বাতিল",
        body: `${row.title} — বাতিল হয়েছে: ${input.reason.trim()}`,
      },
    );
    return this.get(userId, id);
  }

  async complete(userId: string, id: string) {
    const row = await this.hosted(userId, id);
    if (row.status !== SessionStatus.SCHEDULED)
      throw sessionErrors.transition(row.status);
    if (row.starts_at.getTime() > Date.now()) throw sessionErrors.notStarted();
    await this.prisma.session.update({
      where: { id },
      data: { status: SessionStatus.COMPLETED, completed_at: new Date() },
    });
    await this.notify(
      row.participants
        .filter(
          (item) =>
            item.role === SessionParticipantRole.PARTICIPANT &&
            CONFIRMED.includes(item.status),
        )
        .map((item) => item.user_id),
      id,
      "SESSION_COMPLETED",
      {
        title: "সেশন শেষ",
        body: `${row.title} — কেমন লাগল জানিয়ে মতামত দিন।`,
      },
    );
    return this.get(userId, id);
  }

  async attendance(userId: string, id: string, input: SessionAttendanceDto) {
    const row = await this.hosted(userId, id);
    if (
      row.status !== SessionStatus.SCHEDULED &&
      row.status !== SessionStatus.COMPLETED
    )
      throw sessionErrors.transition(row.status);
    if (row.starts_at.getTime() > Date.now()) throw sessionErrors.notStarted();
    const participant = row.participants.find(
      (item) =>
        item.user_id === input.userId &&
        item.role === SessionParticipantRole.PARTICIPANT &&
        [...CONFIRMED, SessionParticipantStatus.NO_SHOW].includes(item.status),
    );
    if (!participant) throw sessionErrors.notFound();
    await this.prisma.sessionParticipant.update({
      where: { id: participant.id },
      data: { status: input.status, attendance_marked_at: new Date() },
    });
    return this.get(userId, id);
  }

  /** CASH sessions: the host records cash received, like a job's cash payment. */
  async recordCash(userId: string, id: string, input: SessionCashDto) {
    const row = await this.hosted(userId, id);
    if (row.price_model !== SessionPriceModel.CASH)
      throw sessionErrors.invalid("priceModel", "This session is free.");
    const participant = row.participants.find(
      (item) =>
        item.user_id === input.userId &&
        item.role === SessionParticipantRole.PARTICIPANT &&
        CONFIRMED.includes(item.status),
    );
    if (!participant) throw sessionErrors.notFound();
    await this.prisma.sessionParticipant.update({
      where: { id: participant.id },
      data: {
        cash_amount_poisha: BigInt(input.amountPoisha),
        cash_recorded_at: new Date(),
        cash_recorded_by: userId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actor_user_id: userId,
        action: "SESSION_CASH_RECORDED",
        entity: "Session",
        entity_id: id,
        after_json: { userId: input.userId, amountPoisha: input.amountPoisha },
      },
    });
    return this.get(userId, id);
  }

  async get(userId: string, id: string) {
    return this.serialize(await this.visible(userId, id), userId);
  }

  /**
   * P3.5: a session or event of a community group, hosted by one of its
   * moderators or ambassadors (DRAFT; publishing announces it to members).
   */
  async createForGroup(
    userId: string,
    groupId: string,
    input: CreateGroupSessionDto,
  ) {
    const membership = await this.prisma.communityGroupMember.findFirst({
      where: {
        group_id: groupId,
        user_id: userId,
        status: GroupMemberStatus.ACTIVE,
        role: { in: [GroupMemberRole.MODERATOR, GroupMemberRole.AMBASSADOR] },
        group: { deleted_at: null, hidden_at: null },
      },
      include: { group: { select: { women_only: true } } },
    });
    if (!membership) throw sessionErrors.notFound();
    await this.assertPlace(input.mode, input.locationId);
    if ((input.venueLat === undefined) !== (input.venueLng === undefined))
      throw sessionErrors.invalid(
        "venueLat",
        "Give both venueLat and venueLng, or neither.",
      );
    const price = this.price(input.priceModel, input.pricePoisha);
    const womenOnly = membership.group.women_only || (input.womenOnly ?? false);
    if (womenOnly) await this.assertWoman(userId);
    const startsAt = new Date(input.startsAt);
    if (startsAt.getTime() < Date.now())
      throw sessionErrors.invalid(
        "startsAt",
        "A session must start in the future.",
      );
    const session = await this.prisma.session.create({
      data: {
        host_user_id: userId,
        kind: input.kind,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        subject_type: SessionSubjectType.GROUP,
        subject_id: groupId,
        group_id: groupId,
        starts_at: startsAt,
        duration_minutes: input.durationMinutes,
        mode: input.mode,
        location_id:
          input.mode === SessionMode.IN_PERSON ? input.locationId! : null,
        online_link:
          input.mode === SessionMode.ONLINE ? (input.onlineLink ?? null) : null,
        venue_lat:
          input.mode === SessionMode.IN_PERSON
            ? (input.venueLat ?? null)
            : null,
        venue_lng:
          input.mode === SessionMode.IN_PERSON
            ? (input.venueLng ?? null)
            : null,
        capacity: input.capacity,
        ...price,
        women_only: womenOnly,
        home_based_friendly: input.homeBasedFriendly ?? false,
        participants: {
          create: {
            user_id: userId,
            role: SessionParticipantRole.HOST,
            status: SessionParticipantStatus.ACCEPTED,
            responded_at: new Date(),
          },
        },
      },
      select: { id: true },
    });
    return this.get(userId, session.id);
  }

  /** P3.5: a group's upcoming and past published sessions (members only). */
  async groupSessions(userId: string, groupId: string) {
    if (!(await this.activeGroupMember(userId, groupId)))
      throw sessionErrors.notFound();
    const hidden = await this.blocks.hiddenFrom(userId);
    const rows = await this.prisma.session.findMany({
      where: {
        group_id: groupId,
        hidden_at: null,
        status: { not: SessionStatus.DRAFT },
        host_user_id: { notIn: hidden },
      },
      include,
      orderBy: [{ starts_at: "asc" }, { id: "asc" }],
      take: 100,
    });
    return { items: rows.map((row) => this.serialize(row, userId)) };
  }

  /**
   * P3.5: RSVP to a group session: a place if one is free, otherwise the
   * waitlist (promoted in order when a place frees).
   */
  async rsvp(userId: string, id: string) {
    const row = await this.visible(userId, id);
    if (
      !row.group_id ||
      row.status !== SessionStatus.SCHEDULED ||
      row.host_user_id === userId
    )
      throw sessionErrors.transition(row.status);
    if (row.women_only) await this.assertWoman(userId);
    const mine = row.participants.find((item) => item.user_id === userId);
    if (
      mine &&
      !(
        [
          SessionParticipantStatus.DECLINED,
          SessionParticipantStatus.INVITED,
        ] as SessionParticipantStatus[]
      ).includes(mine.status)
    )
      return this.get(userId, id);
    const now = new Date();
    let waitlisted = false;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT id FROM sessions WHERE id = ${id}::uuid FOR UPDATE`;
      const taken = await transaction.sessionParticipant.count({
        where: {
          session_id: id,
          role: SessionParticipantRole.PARTICIPANT,
          status: { in: TAKING_A_PLACE },
        },
      });
      waitlisted = taken >= row.capacity;
      const data = {
        status: waitlisted
          ? SessionParticipantStatus.WAITLISTED
          : SessionParticipantStatus.ACCEPTED,
        responded_at: now,
        waitlisted_at: waitlisted ? now : null,
      };
      await transaction.sessionParticipant.upsert({
        where: { session_id_user_id: { session_id: id, user_id: userId } },
        create: {
          session_id: id,
          user_id: userId,
          role: SessionParticipantRole.PARTICIPANT,
          ...data,
        },
        update: data,
      });
    });
    if (!waitlisted) await this.resyncChat(id);
    return this.get(userId, id);
  }

  /**
   * P3.5: check in at an in-person session, by the job check-in rules
   * (flag, consent, accuracy, geofence round the venue pin or the area).
   * From an hour before the start until the end; marks ATTENDED. Only the
   * distance is kept, never the coordinates.
   */
  async checkIn(userId: string, id: string, input: AttendanceLocationDto) {
    const row = await this.visible(userId, id);
    const mine = row.participants.find((item) => item.user_id === userId);
    if (
      row.mode !== SessionMode.IN_PERSON ||
      row.status !== SessionStatus.SCHEDULED ||
      !mine ||
      mine.role !== SessionParticipantRole.PARTICIPANT ||
      mine.status !== SessionParticipantStatus.ACCEPTED
    )
      throw sessionErrors.transition(row.status);
    const now = Date.now();
    const endsAt = row.starts_at.getTime() + row.duration_minutes * MINUTE;
    if (now < row.starts_at.getTime() - 60 * MINUTE || now > endsAt)
      throw sessionErrors.invalid(
        "capturedAt",
        "Check in from an hour before the start until the end.",
      );
    if (!this.attendanceService)
      throw new Error("AttendanceService is not available.");
    const place = await this.prisma.session.findUniqueOrThrow({
      where: { id },
      select: {
        venue_lat: true,
        venue_lng: true,
        location: { select: { lat: true, lng: true, radius_km: true } },
      },
    });
    const presence = await this.attendanceService.verifyPresence(input, {
      lat: place.venue_lat,
      lng: place.venue_lng,
      location: place.location,
    });
    await this.prisma.sessionParticipant.update({
      where: { id: mine.id },
      data: {
        status: SessionParticipantStatus.ATTENDED,
        checked_in_at: new Date(),
        attendance_marked_at: new Date(),
        checkin_distance_m: presence.distanceM,
        checkin_accuracy_m: presence.accuracyM,
        checkin_consent_version: presence.consentVersion,
      },
    });
    return this.get(userId, id);
  }

  /** Fills free places from the waitlist, earliest first. */
  private async promoteWaitlist(id: string) {
    const promoted: string[] = [];
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT id FROM sessions WHERE id = ${id}::uuid FOR UPDATE`;
      const session = await transaction.session.findUniqueOrThrow({
        where: { id },
        select: { capacity: true, status: true },
      });
      if (!OPEN.includes(session.status)) return;
      const taken = await transaction.sessionParticipant.count({
        where: {
          session_id: id,
          role: SessionParticipantRole.PARTICIPANT,
          status: { in: TAKING_A_PLACE },
        },
      });
      const waiting = await transaction.sessionParticipant.findMany({
        where: { session_id: id, status: SessionParticipantStatus.WAITLISTED },
        orderBy: [{ waitlisted_at: "asc" }, { id: "asc" }],
        take: Math.max(0, session.capacity - taken),
      });
      for (const row of waiting) {
        await transaction.sessionParticipant.update({
          where: { id: row.id },
          data: {
            status: SessionParticipantStatus.ACCEPTED,
            responded_at: new Date(),
          },
        });
        promoted.push(row.user_id);
      }
    });
    if (promoted.length)
      await this.notify(promoted, id, "SESSION_WAITLIST_PROMOTED", {
        title: "জায়গা পেয়েছেন",
        body: "অপেক্ষমাণ তালিকা থেকে আপনি এখন সেশনে জায়গা পেয়েছেন।",
      });
  }

  private async activeGroupMember(userId: string, groupId: string) {
    const count = await this.prisma.communityGroupMember.count({
      where: {
        group_id: groupId,
        user_id: userId,
        status: GroupMemberStatus.ACTIVE,
        group: { deleted_at: null, hidden_at: null },
      },
    });
    return count > 0;
  }

  /**
   * P3.3: the session chat — a group conversation of the host and the
   * confirmed participants (members follow the session). Others get 404.
   */
  async chatRoom(userId: string, id: string) {
    const row = await this.visible(userId, id);
    const mine = row.participants.find((item) => item.user_id === userId);
    if (
      row.host_user_id !== userId &&
      !(mine && CONFIRMED.includes(mine.status))
    )
      throw sessionErrors.notFound();
    // G11: a consultation's chat opens only once the expert has said yes.
    if (
      row.kind === SessionKind.CONSULTATION &&
      (row.status === SessionStatus.DRAFT ||
        row.status === SessionStatus.CANCELLED ||
        !row.participants.some(
          (item) =>
            item.role === SessionParticipantRole.EXPERT &&
            CONFIRMED.includes(item.status),
        ))
    )
      throw sessionErrors.consultationNotAccepted();
    return { sessionId: id, conversationId: await this.syncChat(row, true) };
  }

  private async syncChat(row: Row, create = false) {
    if (!this.chat) return null;
    const input = {
      scopeKey: `session:${row.id}`,
      title: row.title,
      subjectType: "SESSION",
      subjectId: row.id,
      memberIds: [row.host_user_id, ...this.confirmedIds(row)],
    };
    if (create) return this.chat.syncGroup(input);
    await this.chat.syncGroupIfExists(input);
    return null;
  }

  /** After a membership change, keep an existing session chat in step. */
  private async resyncChat(id: string) {
    const row = await this.prisma.session.findUnique({
      where: { id },
      include,
    });
    if (row) await this.syncChat(row);
  }

  async list(userId: string, query: SessionListQueryDto) {
    const limit = query.limit ?? 20;
    const role = query.role ?? "all";
    const hidden = await this.blocks.hiddenFrom(userId);
    const rows = await this.prisma.session.findMany({
      where: {
        hidden_at: null,
        // W6 (D-4): a consultation across a block is gone for both sides.
        NOT: {
          kind: SessionKind.CONSULTATION,
          participants: { some: { user_id: { in: hidden } } },
        },
        ...(query.status ? { status: query.status } : {}),
        ...(role === "hosting"
          ? { host_user_id: userId }
          : role === "attending"
            ? {
                host_user_id: { not: userId, notIn: hidden },
                participants: { some: { user_id: userId } },
              }
            : {
                host_user_id: { notIn: hidden },
                participants: { some: { user_id: userId } },
              }),
      },
      include,
      orderBy: [{ starts_at: "asc" }, { id: "asc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    return {
      items: page.items.map((row) => this.serialize(row, userId)),
      nextCursor: page.nextCursor,
    };
  }

  /** Reminders an hour ahead to the host and confirmed participants (runner). */
  async sendReminders(now = new Date()) {
    const due = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.SCHEDULED,
        reminder_sent_at: null,
        hidden_at: null,
        starts_at: { gt: now, lte: new Date(now.getTime() + 60 * MINUTE) },
      },
      include,
      take: 200,
    });
    for (const row of due) {
      const claimed = await this.prisma.session.updateMany({
        where: { id: row.id, reminder_sent_at: null },
        data: { reminder_sent_at: now },
      });
      if (claimed.count !== 1) continue;
      await this.notify(this.confirmedIds(row), row.id, "SESSION_REMINDER", {
        title: "সেশন শীঘ্রই শুরু",
        body: `${row.title} — এক ঘণ্টার মধ্যে শুরু হবে।`,
      });
    }
    return { reminded: due.length };
  }

  /** 404 unless the viewer is the host or on the session; blocks hide it. */
  async visible(userId: string, id: string): Promise<Row> {
    const row = await this.prisma.session.findUnique({
      where: { id },
      include,
    });
    if (!row) throw sessionErrors.notFound();
    const isHost = row.host_user_id === userId;
    if (!isHost) {
      if (row.hidden_at) throw sessionErrors.notFound();
      const onIt = row.participants.some((item) => item.user_id === userId);
      // P3.5: a group's published sessions are visible to its active members.
      const groupMember =
        !onIt &&
        row.group_id !== null &&
        row.status !== SessionStatus.DRAFT &&
        (await this.activeGroupMember(userId, row.group_id));
      if (!onIt && !groupMember) throw sessionErrors.notFound();
      if (await this.blocks.between(userId, row.host_user_id))
        throw sessionErrors.notFound();
    }
    // W6 (D-4): a consultation is one to one, so a block between the expert
    // and the person who booked hides it from both, host included.
    if (row.kind === SessionKind.CONSULTATION) {
      const hidden = new Set(await this.blocks.hiddenFrom(userId));
      if (row.participants.some((item) => hidden.has(item.user_id)))
        throw sessionErrors.notFound();
    }
    return row;
  }

  private async hosted(userId: string, id: string) {
    const row = await this.visible(userId, id);
    if (row.host_user_id !== userId) throw sessionErrors.notFound();
    return row;
  }

  serialize(row: Row, viewerUserId: string) {
    const isHost = row.host_user_id === viewerUserId;
    const mine = row.participants.find((item) => item.user_id === viewerUserId);
    const confirmed =
      isHost || (mine !== undefined && CONFIRMED.includes(mine.status));
    const name = (
      user: {
        id: string;
        profile: { display_name: string; show_full_name: boolean } | null;
      },
      engaged: boolean,
    ) => ({
      userId: user.id,
      displayName: visibleDisplayName(user.profile?.display_name ?? "", {
        showFullName: user.profile?.show_full_name ?? false,
        hired: engaged,
      }),
    });
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      description: row.description,
      subject: row.subject_type
        ? { type: row.subject_type, id: row.subject_id }
        : null,
      status: row.status,
      startsAt: row.starts_at.toISOString(),
      endsAt: new Date(
        row.starts_at.getTime() + row.duration_minutes * MINUTE,
      ).toISOString(),
      durationMinutes: row.duration_minutes,
      mode: row.mode,
      area: row.location
        ? {
            id: row.location.id,
            nameEn: row.location.name_en,
            nameBn: row.location.name_bn,
          }
        : null,
      // Only for the host and confirmed participants.
      onlineLink: confirmed ? row.online_link : null,
      capacity: row.capacity,
      placesTaken: this.placesTaken(row),
      priceModel: row.price_model,
      pricePoisha: row.price_poisha?.toString() ?? null,
      womenOnly: row.women_only,
      homeBasedFriendly: row.home_based_friendly,
      host: name(row.host, confirmed),
      expert: row.expert ? name(row.expert, confirmed) : null,
      introductionId: row.introduction_id,
      groupId: row.group_id,
      myCheckedInAt: mine?.checked_in_at?.toISOString() ?? null,
      waitlistPosition:
        mine?.status === SessionParticipantStatus.WAITLISTED
          ? row.participants.filter(
              (item) =>
                item.status === SessionParticipantStatus.WAITLISTED &&
                (item.waitlisted_at?.getTime() ?? 0) <=
                  (mine.waitlisted_at?.getTime() ?? 0),
            ).length
          : null,
      myRole: isHost ? "HOST" : (mine?.role ?? null),
      myStatus: mine?.status ?? null,
      cancelReason: row.cancel_reason,
      completedAt: row.completed_at?.toISOString() ?? null,
      // The host sees everyone; others see the confirmed people.
      participants: row.participants
        .filter((item) => isHost || CONFIRMED.includes(item.status))
        .map((item) => ({
          ...name(item.user, confirmed),
          role: item.role,
          status: item.status,
          ...(isHost
            ? {
                cashAmountPoisha: item.cash_amount_poisha?.toString() ?? null,
                cashRecordedAt: item.cash_recorded_at?.toISOString() ?? null,
              }
            : {}),
        })),
      hiddenReason: isHost ? row.hidden_reason : null,
      createdAt: row.created_at.toISOString(),
    };
  }

  private placesTaken(row: Row) {
    return row.participants.filter(
      (item) =>
        item.role === SessionParticipantRole.PARTICIPANT &&
        TAKING_A_PLACE.includes(item.status),
    ).length;
  }

  private confirmedIds(row: Row) {
    return row.participants
      .filter((item) => CONFIRMED.includes(item.status))
      .map((item) => item.user_id);
  }

  /** One booking or acceptance at a time per expert (transaction-scoped). */
  private async lockExpert(
    transaction: Prisma.TransactionClient,
    expertUserId: string,
  ) {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`consultation-expert:${expertUserId}`}))`;
  }

  /** True when the expert has said yes to another open session overlapping this one. */
  private async expertTaken(
    transaction: Prisma.TransactionClient,
    expertUserId: string,
    row: Row,
  ) {
    const endsAt = row.starts_at.getTime() + row.duration_minutes * MINUTE;
    const others = await transaction.session.findMany({
      where: {
        id: { not: row.id },
        status: { in: OPEN },
        starts_at: {
          lt: new Date(endsAt),
          gt: new Date(row.starts_at.getTime() - 12 * 60 * MINUTE),
        },
        participants: {
          some: {
            user_id: expertUserId,
            status: SessionParticipantStatus.ACCEPTED,
          },
        },
      },
      select: { starts_at: true, duration_minutes: true },
    });
    return others.some(
      (other) =>
        other.starts_at.getTime() + other.duration_minutes * MINUTE >
        row.starts_at.getTime(),
    );
  }

  /** The expert's sessions in a window, so a consultation never overlaps them. */
  private async busyWindows(
    expertUserId: string,
    from: Date,
    to: Date,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const sessions = await db.session.findMany({
      where: {
        status: { in: OPEN },
        starts_at: { lt: to, gt: new Date(from.getTime() - 12 * 60 * MINUTE) },
        participants: {
          some: {
            user_id: expertUserId,
            status: {
              in: [
                SessionParticipantStatus.ACCEPTED,
                SessionParticipantStatus.INVITED,
              ],
            },
          },
        },
      },
      select: { starts_at: true, duration_minutes: true },
    });
    return sessions.map((item) => ({
      startsAt: item.starts_at,
      endsAt: new Date(
        item.starts_at.getTime() + item.duration_minutes * MINUTE,
      ),
    }));
  }

  private async assertExpert(viewerUserId: string, expertUserId: string) {
    const expert = await this.prisma.user.count({
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
    });
    if (!expert || (await this.blocks.between(viewerUserId, expertUserId)))
      throw sessionErrors.notFound();
  }

  private async assertPlace(mode: SessionMode, locationId?: string) {
    if (mode !== SessionMode.IN_PERSON) return;
    if (!locationId)
      throw sessionErrors.invalid(
        "locationId",
        "An in-person session needs an area.",
      );
    const location = await this.prisma.location.count({
      where: { id: locationId, is_active: true },
    });
    if (!location)
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Unknown area.",
        messageKey: "error.validation.failed",
        field: "locationId",
      });
  }

  private async assertWoman(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { gender: true },
    });
    if (profile?.gender !== Gender.FEMALE) throw sessionErrors.womenOnly();
  }

  private price(model?: SessionPriceModel, pricePoisha?: string) {
    if (!model || model === SessionPriceModel.FREE)
      return { price_model: SessionPriceModel.FREE, price_poisha: null };
    if (!pricePoisha || BigInt(pricePoisha) <= 0n)
      throw sessionErrors.invalid(
        "pricePoisha",
        "A cash session needs a price.",
      );
    return {
      price_model: SessionPriceModel.CASH,
      price_poisha: BigInt(pricePoisha),
    };
  }

  private range(fromInput: string, toInput: string) {
    const from = new Date(fromInput);
    const to = new Date(toInput);
    if (to <= from || to.getTime() - from.getTime() > 31 * 24 * 60 * MINUTE)
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Use a range of up to 31 days.",
        messageKey: "error.validation.failed",
        field: "to",
      });
    if (to.getTime() < Date.now())
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Slots are only shown for upcoming dates.",
        messageKey: "error.validation.failed",
        field: "from",
      });
    return { from, to };
  }

  private async notify(
    userIds: string[],
    sessionId: string,
    type: string,
    text: { title: string; body: string },
  ) {
    const at = Date.now();
    for (const userId of new Set(userIds))
      await this.notifications?.create({
        userId,
        type,
        title: text.title,
        body: text.body,
        payload: { route: `/sessions/${sessionId}`, sessionId },
        dedupeKey: `session:${sessionId}:${type}:${userId}:${at}`,
      });
  }
}
