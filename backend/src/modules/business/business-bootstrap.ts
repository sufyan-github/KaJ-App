import { BusinessMemberRole, BusinessStage, Prisma } from "@prisma/client";

/**
 * Activating the BUSINESS capability gives the person a business profile to
 * fill in (private until they publish it), unless they already own one.
 * Returns that business's id.
 */
export async function ensureOwnedBusiness(
  transaction: Prisma.TransactionClient,
  userId: string,
  defaults: { name: string; locationId: string | null },
): Promise<string> {
  const owned = await transaction.businessMember.findFirst({
    where: {
      user_id: userId,
      role: BusinessMemberRole.OWNER,
      accepted_at: { not: null },
      business: { deleted_at: null },
    },
    orderBy: { created_at: "asc" },
    select: { business_profile_id: true },
  });
  if (owned) return owned.business_profile_id;
  const now = new Date();
  const business = await transaction.businessProfile.create({
    data: {
      user_id: userId,
      business_name: defaults.name.trim() || "আমার ব্যবসা",
      stage: BusinessStage.INFORMAL,
      location_id: defaults.locationId,
      members: {
        create: {
          user_id: userId,
          role: BusinessMemberRole.OWNER,
          accepted_at: now,
        },
      },
    },
    select: { id: true },
  });
  return business.id;
}
