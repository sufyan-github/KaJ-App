import {
  Prisma,
  PrismaClient,
  SessionParticipantStatus,
  SessionStatus,
  UserStatus,
} from "@prisma/client";

/**
 * DB-3: an account that can take part. Listings (work and learning feeds)
 * and session reminders only come from such accounts, so a suspended,
 * banned or deleting person's listings disappear while that lasts.
 */
export const ACTIVE_ACCOUNT = {
  status: UserStatus.ACTIVE,
  deleted_at: null,
} satisfies Prisma.UserWhereInput;

/**
 * DB-3: when someone is suspended, banned or asks to delete their account,
 * the sessions they host that have not happened yet are cancelled, and the
 * people who had a place are told. Returns the cancelled session ids.
 */
export async function cancelHostedSessions(
  prisma: PrismaClient,
  hostUserId: string,
  reason: string,
): Promise<string[]> {
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: {
      host_user_id: hostUserId,
      status: { in: [SessionStatus.DRAFT, SessionStatus.SCHEDULED] },
      starts_at: { gt: now },
    },
    select: {
      id: true,
      title: true,
      participants: {
        where: {
          user_id: { not: hostUserId },
          status: {
            in: [
              SessionParticipantStatus.INVITED,
              SessionParticipantStatus.ACCEPTED,
              SessionParticipantStatus.WAITLISTED,
            ],
          },
        },
        select: { user_id: true },
      },
    },
  });
  for (const session of sessions) {
    const cancelled = await prisma.session.updateMany({
      where: {
        id: session.id,
        status: { in: [SessionStatus.DRAFT, SessionStatus.SCHEDULED] },
      },
      data: {
        status: SessionStatus.CANCELLED,
        cancelled_at: now,
        cancel_reason: reason,
      },
    });
    if (cancelled.count !== 1 || !session.participants.length) continue;
    await prisma.notification.createMany({
      data: session.participants.map((participant) => ({
        user_id: participant.user_id,
        type: "SESSION_CANCELLED",
        title_key: "সেশন বাতিল",
        body_key: `${session.title} — বাতিল হয়েছে: আয়োজক এখন আর পাওয়া যাচ্ছেন না।`,
        payload_json: {
          route: `/sessions/${session.id}`,
          sessionId: session.id,
        },
      })),
    });
  }
  return sessions.map((session) => session.id);
}
