import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/** P2 content an admin can hide (and restore) from the report queue. */
export const CONTENT_TARGET_TYPES = [
  "BUSINESS",
  "BUSINESS_OFFERING",
  "IDEA",
  "IDEA_ROLE",
  "COLLABORATION_REQUEST",
] as const;
export type ContentTargetType = (typeof CONTENT_TARGET_TYPES)[number];

export function isContentTarget(type: string): type is ContentTargetType {
  return (CONTENT_TARGET_TYPES as readonly string[]).includes(type);
}

type Client = Prisma.TransactionClient;

/**
 * Hides (or restores) one piece of content. A business is suspended; the
 * others get hidden_at. Returns who owns it, to tell them, and a title for
 * the notification. Throws 404 for an unknown id.
 */
export async function setContentHidden(
  transaction: Client,
  type: ContentTargetType,
  id: string,
  hidden: boolean,
  reason: string | null,
): Promise<{ ownerUserId: string | null; title: string }> {
  const at = hidden ? new Date() : null;
  const why = hidden ? reason : null;
  switch (type) {
    case "BUSINESS": {
      const business = await transaction.businessProfile
        .update({
          where: { id },
          data: { suspended_at: at, suspension_reason: why },
          select: { user_id: true, business_name: true },
        })
        .catch(notFound);
      return { ownerUserId: business.user_id, title: business.business_name };
    }
    case "BUSINESS_OFFERING": {
      const offering = await transaction.businessOffering
        .update({
          where: { id },
          data: { hidden_at: at, hidden_reason: why },
          select: {
            title_en: true,
            title_bn: true,
            business: { select: { user_id: true } },
          },
        })
        .catch(notFound);
      return {
        ownerUserId: offering.business.user_id,
        title: offering.title_bn ?? offering.title_en ?? "",
      };
    }
    case "IDEA": {
      const idea = await transaction.businessIdea
        .update({
          where: { id },
          data: { hidden_at: at, hidden_reason: why },
          select: { owner_user_id: true, title: true },
        })
        .catch(notFound);
      return { ownerUserId: idea.owner_user_id, title: idea.title };
    }
    case "IDEA_ROLE": {
      const role = await transaction.ideaRole
        .update({
          where: { id },
          data: { hidden_at: at },
          select: {
            title: true,
            role_type: true,
            idea: { select: { owner_user_id: true, title: true } },
          },
        })
        .catch(notFound);
      return {
        ownerUserId: role.idea.owner_user_id,
        title: `${role.idea.title} — ${role.title ?? role.role_type}`,
      };
    }
    case "COLLABORATION_REQUEST": {
      const request = await transaction.collaborationRequest
        .update({
          where: { id },
          data: { hidden_at: at },
          select: { requester_user_id: true },
        })
        .catch(notFound);
      return { ownerUserId: request.requester_user_id, title: "" };
    }
  }
}

/** A short description of a P2 target for the admin report queue. */
export async function describeContent(
  prisma: Pick<
    Client,
    | "businessProfile"
    | "businessOffering"
    | "businessIdea"
    | "ideaRole"
    | "collaborationRequest"
  >,
  type: ContentTargetType,
  id: string,
): Promise<{ title: string; status: "VISIBLE" | "HIDDEN" | "DELETED" } | null> {
  switch (type) {
    case "BUSINESS": {
      const row = await prisma.businessProfile.findUnique({
        where: { id },
        select: { business_name: true, suspended_at: true, deleted_at: true },
      });
      return row
        ? {
            title: row.business_name,
            status: row.deleted_at
              ? "DELETED"
              : row.suspended_at
                ? "HIDDEN"
                : "VISIBLE",
          }
        : null;
    }
    case "BUSINESS_OFFERING": {
      const row = await prisma.businessOffering.findUnique({
        where: { id },
        select: {
          title_en: true,
          title_bn: true,
          hidden_at: true,
          deleted_at: true,
        },
      });
      return row
        ? {
            title: row.title_bn ?? row.title_en ?? "",
            status: row.deleted_at
              ? "DELETED"
              : row.hidden_at
                ? "HIDDEN"
                : "VISIBLE",
          }
        : null;
    }
    case "IDEA": {
      const row = await prisma.businessIdea.findUnique({
        where: { id },
        select: { title: true, hidden_at: true, deleted_at: true },
      });
      return row
        ? {
            title: row.title,
            status: row.deleted_at
              ? "DELETED"
              : row.hidden_at
                ? "HIDDEN"
                : "VISIBLE",
          }
        : null;
    }
    case "IDEA_ROLE": {
      const row = await prisma.ideaRole.findUnique({
        where: { id },
        select: { title: true, role_type: true, hidden_at: true },
      });
      return row
        ? {
            title: row.title ?? row.role_type,
            status: row.hidden_at ? "HIDDEN" : "VISIBLE",
          }
        : null;
    }
    case "COLLABORATION_REQUEST": {
      const row = await prisma.collaborationRequest.findUnique({
        where: { id },
        select: { message: true, hidden_at: true },
      });
      return row
        ? {
            title: row.message.slice(0, 80),
            status: row.hidden_at ? "HIDDEN" : "VISIBLE",
          }
        : null;
    }
  }
}

function notFound(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  )
    throw new NotFoundException();
  throw error;
}
