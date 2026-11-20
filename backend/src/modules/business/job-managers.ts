import { BusinessMemberRole, Prisma, PrismaClient } from "@prisma/client";

type Client = Pick<PrismaClient | Prisma.TransactionClient, "businessMember">;

const MANAGING: BusinessMemberRole[] = [
  BusinessMemberRole.OWNER,
  BusinessMemberRole.MANAGER,
];

/**
 * W8: who runs a job. A personal job: its poster. A business's job: the
 * business's active owners and managers, whoever posted it, so the owner
 * sees a manager's job and a manager who left loses it.
 */
export async function jobManagerIds(
  prisma: Client,
  job: { poster_user_id: string; business_profile_id: string | null },
): Promise<string[]> {
  if (!job.business_profile_id) return [job.poster_user_id];
  const members = await prisma.businessMember.findMany({
    where: {
      business_profile_id: job.business_profile_id,
      accepted_at: { not: null },
      role: { in: MANAGING },
      business: { deleted_at: null },
    },
    select: { user_id: true },
  });
  return members.map((member) => member.user_id);
}

export async function managesJob(
  prisma: Client,
  userId: string,
  job: { poster_user_id: string; business_profile_id: string | null },
): Promise<boolean> {
  return (await jobManagerIds(prisma, job)).includes(userId);
}

/**
 * W8: whom to tell about a business: its current owners (oldest first), or
 * the creator when no accepted owner is recorded.
 */
export async function currentBusinessOwnerId(
  prisma: Client,
  businessId: string,
  creatorUserId: string,
): Promise<string> {
  const owner = await prisma.businessMember.findFirst({
    where: {
      business_profile_id: businessId,
      role: BusinessMemberRole.OWNER,
      accepted_at: { not: null },
    },
    orderBy: [{ accepted_at: "asc" }, { id: "asc" }],
    select: { user_id: true },
  });
  return owner?.user_id ?? creatorUserId;
}
