import { MentorStatus, Prisma, RoleMode } from "@prisma/client";

/**
 * What an admin's decision on a MENTOR verification request does, inside the
 * decision's transaction. Approval grants the MENTOR role and opens the
 * mentor to learners; rejection withdraws the offered skills.
 */
export async function applyMentorDecision(
  transaction: Prisma.TransactionClient,
  userId: string,
  approved: boolean,
  decidedAt: Date,
) {
  if (approved) {
    const user = await transaction.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role_modes: true },
    });
    await transaction.user.update({
      where: { id: userId },
      data: {
        role_modes: user.role_modes.includes(RoleMode.MENTOR)
          ? user.role_modes
          : [...user.role_modes, RoleMode.MENTOR],
      },
    });
    await transaction.profile.update({
      where: { user_id: userId },
      data: {
        mentor_status: MentorStatus.APPROVED,
        mentor_approved_at: decidedAt,
        mentor_accepting: true,
      },
    });
    return;
  }
  await transaction.profile.update({
    where: { user_id: userId },
    data: { mentor_status: MentorStatus.REJECTED, mentor_accepting: false },
  });
  await transaction.userSkill.updateMany({
    where: { user_id: userId, can_mentor: true },
    data: { can_mentor: false },
  });
}
