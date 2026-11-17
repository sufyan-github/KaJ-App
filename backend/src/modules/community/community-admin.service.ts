import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  GroupMemberRole,
  GroupMemberStatus,
  ReportStatus,
} from "@prisma/client";

import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import { audit } from "../learning/learning-admin.service";
import {
  AdminGroupQueryDto,
  AdminGroupRoleDto,
  AdminSessionQueryDto,
} from "./dto/community-admin.dto";
import { GroupsService } from "./groups.service";

const OPEN_REPORTS = [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW];
const name = (user: { profile: { display_name: string } | null } | null) =>
  user?.profile?.display_name ?? "Unknown";

/**
 * P3 admin: views of community groups, sessions and events, and ambassador
 * management. Hiding and restoring go through the report queue and
 * /admin/content/:type/:id (GROUP, SESSION, INTRODUCTION). Views are
 * audit-logged. Private details (online links, venue pins, idea text) are
 * never shown here.
 */
@Injectable()
export class CommunityAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
  ) {}

  async groupList(
    query: AdminGroupQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const limit = query.limit ?? 50;
    const q = query.q?.trim();
    const rows = await this.prisma.communityGroup.findMany({
      where: {
        deleted_at: null,
        ...(query.status === "HIDDEN"
          ? { hidden_at: { not: null } }
          : query.status === "ACTIVE"
            ? { hidden_at: null }
            : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      include: {
        created_by: {
          select: { id: true, profile: { select: { display_name: true } } },
        },
        members: {
          where: {
            status: GroupMemberStatus.ACTIVE,
            role: {
              in: [GroupMemberRole.MODERATOR, GroupMemberRole.AMBASSADOR],
            },
          },
          select: {
            role: true,
            user: {
              select: { id: true, profile: { select: { display_name: true } } },
            },
          },
        },
        _count: {
          select: { members: { where: { status: GroupMemberStatus.ACTIVE } } },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    const reports = await this.openReports(
      "GROUP",
      page.items.map((row) => row.id),
    );
    await this.prisma.auditLog.create({
      data: audit(
        actor,
        context,
        "ADMIN_COMMUNITY_GROUPS_VIEWED",
        "COMMUNITY_GROUP",
        null,
        null,
        {
          status: query.status ?? null,
        },
      ),
    });
    return {
      items: page.items.map((row) => ({
        id: row.id,
        name: row.name,
        visibility: row.visibility,
        womenOnly: row.women_only,
        memberCount: row._count.members,
        createdBy: { userId: row.created_by.id, name: name(row.created_by) },
        moderators: row.members
          .filter((member) => member.role === GroupMemberRole.MODERATOR)
          .map((member) => ({
            userId: member.user.id,
            name: name(member.user),
          })),
        ambassadors: row.members
          .filter((member) => member.role === GroupMemberRole.AMBASSADOR)
          .map((member) => ({
            userId: member.user.id,
            name: name(member.user),
          })),
        openReports: reports.get(row.id) ?? 0,
        status: row.hidden_at ? "HIDDEN" : "ACTIVE",
        hiddenReason: row.hidden_reason,
        createdAt: row.created_at.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async sessionList(
    query: AdminSessionQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const limit = query.limit ?? 50;
    const rows = await this.prisma.session.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.hidden === "true"
          ? { hidden_at: { not: null } }
          : query.hidden === "false"
            ? { hidden_at: null }
            : {}),
      },
      include: {
        host: {
          select: { id: true, profile: { select: { display_name: true } } },
        },
        group: { select: { id: true, name: true } },
        location: { select: { name_en: true, name_bn: true } },
        participants: { select: { status: true, role: true } },
      },
      orderBy: [{ starts_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    const reports = await this.openReports(
      "SESSION",
      page.items.map((row) => row.id),
    );
    await this.prisma.auditLog.create({
      data: audit(
        actor,
        context,
        "ADMIN_SESSIONS_VIEWED",
        "SESSION",
        null,
        null,
        {
          status: query.status ?? null,
          kind: query.kind ?? null,
        },
      ),
    });
    const count = (row: (typeof rows)[number], statuses: string[]) =>
      row.participants.filter(
        (item) => item.role === "PARTICIPANT" && statuses.includes(item.status),
      ).length;
    return {
      items: page.items.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        status: row.status,
        startsAt: row.starts_at.toISOString(),
        durationMinutes: row.duration_minutes,
        mode: row.mode,
        area: row.location,
        capacity: row.capacity,
        accepted: count(row, ["ACCEPTED", "ATTENDED"]),
        waitlisted: count(row, ["WAITLISTED"]),
        attended: count(row, ["ATTENDED"]),
        priceModel: row.price_model,
        pricePoisha: row.price_poisha?.toString() ?? null,
        womenOnly: row.women_only,
        host: { userId: row.host.id, name: name(row.host) },
        group: row.group,
        openReports: reports.get(row.id) ?? 0,
        visibility: row.hidden_at ? "HIDDEN" : "VISIBLE",
        hiddenReason: row.hidden_reason,
      })),
      nextCursor: page.nextCursor,
    };
  }

  async ambassadors(actor: AdminActor, context: AdminRequestContext) {
    const rows = await this.prisma.communityGroupMember.findMany({
      where: {
        role: GroupMemberRole.AMBASSADOR,
        status: GroupMemberStatus.ACTIVE,
        group: { deleted_at: null },
      },
      include: {
        user: {
          select: { id: true, profile: { select: { display_name: true } } },
        },
        group: { select: { id: true, name: true, hidden_at: true } },
      },
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
      take: 500,
    });
    await this.prisma.auditLog.create({
      data: audit(
        actor,
        context,
        "ADMIN_AMBASSADORS_VIEWED",
        "COMMUNITY_GROUP",
        null,
        null,
        {},
      ),
    });
    const byUser = new Map<
      string,
      {
        userId: string;
        name: string;
        groups: Array<{ id: string; name: string; hidden: boolean }>;
      }
    >();
    for (const row of rows) {
      const entry = byUser.get(row.user_id) ?? {
        userId: row.user_id,
        name: name(row.user),
        groups: [],
      };
      entry.groups.push({
        id: row.group.id,
        name: row.group.name,
        hidden: row.group.hidden_at !== null,
      });
      byUser.set(row.user_id, entry);
    }
    return { items: [...byUser.values()] };
  }

  /** Staff change a member's role in a group (e.g. appoint or remove an ambassador). */
  async setRole(
    groupId: string,
    userId: string,
    input: AdminGroupRoleDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const membership = await this.prisma.communityGroupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    if (!membership || membership.status !== GroupMemberStatus.ACTIVE)
      throw new NotFoundException();
    if (
      membership.role === GroupMemberRole.MODERATOR &&
      input.role !== GroupMemberRole.MODERATOR
    ) {
      const moderators = await this.prisma.communityGroupMember.count({
        where: {
          group_id: groupId,
          role: GroupMemberRole.MODERATOR,
          status: GroupMemberStatus.ACTIVE,
        },
      });
      if (moderators <= 1)
        throw new ConflictException({
          code: "LAST_MODERATOR",
          message: "A group needs at least one moderator. Add another first.",
          messageKey: "error.community.last_moderator",
        });
    }
    await this.prisma.$transaction([
      this.prisma.communityGroupMember.update({
        where: { id: membership.id },
        data: { role: input.role },
      }),
      this.prisma.auditLog.create({
        data: audit(
          actor,
          context,
          "ADMIN_COMMUNITY_ROLE_CHANGED",
          "COMMUNITY_GROUP",
          groupId,
          { userId, role: membership.role },
          { userId, role: input.role, reason: input.reason.trim() },
        ),
      }),
    ]);
    await this.groups.syncAmbassadorBadge(userId);
    return { groupId, userId, role: input.role };
  }

  private async openReports(targetType: string, ids: string[]) {
    if (!ids.length) return new Map<string, number>();
    const rows = await this.prisma.report.groupBy({
      by: ["target_id"],
      where: {
        target_type: targetType,
        target_id: { in: ids },
        status: { in: OPEN_REPORTS },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.target_id, row._count._all]));
  }
}
