import {
  IdeaAccessStatus,
  IdeaVisibility,
  Prisma,
  UserStatus,
} from "@prisma/client";

/**
 * P2.7 — the one place that decides what someone may see of an idea.
 *
 * - OWNER: everything (even when moderation hid it).
 * - MEMBER (team) and ACCESS (owner-approved, not revoked, and the idea is
 *   not MEMBERS-only): the private details; each view is logged.
 * - SUMMARY: only the public summary card, for a SUMMARY_PUBLIC idea whose
 *   owner is active and discoverable.
 * - null: nothing — every endpoint answers 404.
 *
 * Deleted or hidden ideas, and any pair in a block, are always null (the
 * owner excepted for their own idea).
 */
export type IdeaRelation = "OWNER" | "MEMBER" | "ACCESS" | "SUMMARY";

export const ideaVisibilitySelect = {
  id: true,
  owner_user_id: true,
  visibility: true,
  hidden_at: true,
  deleted_at: true,
  owner: {
    select: {
      status: true,
      deleted_at: true,
      profile: { select: { discoverable: true } },
    },
  },
} satisfies Prisma.BusinessIdeaSelect;

export type IdeaVisibilityRow = Prisma.BusinessIdeaGetPayload<{
  select: typeof ideaVisibilitySelect;
}>;

type Client = Pick<
  Prisma.TransactionClient,
  "businessIdea" | "ideaMember" | "ideaAccess" | "userBlock"
>;

export async function ideaRelation(
  prisma: Client,
  viewerUserId: string,
  idea: IdeaVisibilityRow | string | null,
): Promise<IdeaRelation | null> {
  const row =
    typeof idea === "string"
      ? await prisma.businessIdea.findUnique({
          where: { id: idea },
          select: ideaVisibilitySelect,
        })
      : idea;
  if (!row || row.deleted_at) return null;
  if (row.owner_user_id === viewerUserId) return "OWNER";
  if (row.hidden_at) return null;
  if (row.owner.status !== UserStatus.ACTIVE || row.owner.deleted_at)
    return null;
  const blocked = await prisma.userBlock.count({
    where: {
      OR: [
        { blocker_user_id: viewerUserId, blocked_user_id: row.owner_user_id },
        { blocker_user_id: row.owner_user_id, blocked_user_id: viewerUserId },
      ],
    },
  });
  if (blocked) return null;
  const [member, access] = await Promise.all([
    prisma.ideaMember.count({
      where: { idea_id: row.id, user_id: viewerUserId },
    }),
    prisma.ideaAccess.findUnique({
      where: { idea_id_user_id: { idea_id: row.id, user_id: viewerUserId } },
      select: { status: true },
    }),
  ]);
  if (member) return "MEMBER";
  if (
    access?.status === IdeaAccessStatus.APPROVED &&
    row.visibility !== IdeaVisibility.MEMBERS
  )
    return "ACCESS";
  if (
    row.visibility === IdeaVisibility.SUMMARY_PUBLIC &&
    row.owner.profile?.discoverable !== false
  )
    return "SUMMARY";
  return null;
}

export function canSeeDetails(relation: IdeaRelation | null): boolean {
  return relation === "OWNER" || relation === "MEMBER" || relation === "ACCESS";
}

export function isTeam(relation: IdeaRelation | null): boolean {
  return relation === "OWNER" || relation === "MEMBER";
}

/** Shown when asking for and when holding access to private details. */
export const CONFIDENTIALITY_NOTICE = {
  key: "idea.notice.confidentiality",
  en: "This idea is shared with you in confidence. Don't copy, share or use it without the owner's permission.",
  bn: "এই আইডিয়াটি আপনাকে বিশ্বাস করে দেখানো হচ্ছে। মালিকের অনুমতি ছাড়া এটি নকল, শেয়ার বা ব্যবহার করবেন না।",
} as const;
