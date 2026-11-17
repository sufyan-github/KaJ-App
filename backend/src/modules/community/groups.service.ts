import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import {
  Gender,
  GroupMemberRole,
  GroupMemberStatus,
  GroupVisibility,
  Prisma,
  TrustLevel,
  UserStatus,
} from "@prisma/client";

import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ChatService } from "../chat/chat.service";
import { NotificationsService } from "../notifications/notifications.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { visibleDisplayName } from "../users/public-profile.projection";
import { hasTrust } from "../verification/trust-level";
import { communityErrors } from "./community.errors";
import {
  CreateGroupDto,
  GroupMemberRoleDto,
  GroupMembersQueryDto,
  GroupSearchQueryDto,
  InviteGroupMembersDto,
  UpdateGroupDto,
} from "./dto/community.dto";

const MAX_CREATED = 5;
export const AMBASSADOR_BADGE = {
  slug: "community-ambassador",
  name_en: "Community ambassador",
  name_bn: "কমিউনিটি অ্যাম্বাসেডর",
  icon: "campaign",
} as const;

const groupInclude = {
  location: { select: { id: true, name_en: true, name_bn: true } },
  category: { select: { id: true, name_en: true, name_bn: true } },
  _count: {
    select: { members: { where: { status: GroupMemberStatus.ACTIVE } } },
  },
} satisfies Prisma.CommunityGroupInclude;

type GroupRow = Prisma.CommunityGroupGetPayload<{
  include: typeof groupInclude;
}>;
type Membership = {
  id: string;
  role: GroupMemberRole;
  status: GroupMemberStatus;
  invited_by_user_id: string | null;
} | null;

/**
 * P3.4: community groups. PUBLIC groups can be found and joined; PRIVATE
 * groups are by invitation and, like every member list, visible to members
 * only (404 otherwise). Women-only groups are opt-in: a profile marked
 * female plus a moderator's approval. Blocked people never appear in each
 * other's member lists. Each group has a group chat.
 */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly userBlocks?: UserBlocksService,
    @Optional() private readonly chat?: ChatService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  async create(userId: string, input: CreateGroupDto) {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { trust_level: true, gender: true },
    });
    if (!hasTrust(profile?.trust_level ?? TrustLevel.NONE, TrustLevel.IDENTITY))
      throw communityErrors.identityRequired();
    if (input.womenOnly && profile?.gender !== Gender.FEMALE)
      throw communityErrors.womenOnly();
    const created = await this.prisma.communityGroup.count({
      where: { created_by_user_id: userId, deleted_at: null },
    });
    if (created >= MAX_CREATED) throw communityErrors.limit();
    await this.assertReferences(input.locationId, input.categoryId);
    const now = new Date();
    const group = await this.prisma.communityGroup.create({
      data: {
        created_by_user_id: userId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        visibility: input.visibility ?? GroupVisibility.PUBLIC,
        women_only: input.womenOnly ?? false,
        location_id: input.locationId ?? null,
        category_id: input.categoryId ?? null,
        members: {
          create: {
            user_id: userId,
            role: GroupMemberRole.MODERATOR,
            status: GroupMemberStatus.ACTIVE,
            joined_at: now,
          },
        },
      },
      select: { id: true },
    });
    await this.audit(userId, "COMMUNITY_GROUP_CREATED", group.id, {
      visibility: input.visibility ?? GroupVisibility.PUBLIC,
      womenOnly: input.womenOnly ?? false,
    });
    return this.get(userId, group.id);
  }

  /** Public groups to discover (plus none of the private ones). */
  async search(userId: string, query: GroupSearchQueryDto) {
    const limit = query.limit ?? 20;
    const q = query.q?.trim();
    const rows = await this.prisma.communityGroup.findMany({
      where: {
        visibility: GroupVisibility.PUBLIC,
        hidden_at: null,
        deleted_at: null,
        ...(query.womenOnly ? { women_only: query.womenOnly === "true" } : {}),
        ...(query.categoryId ? { category_id: query.categoryId } : {}),
        ...(query.locationId
          ? {
              location: {
                OR: [
                  { id: query.locationId },
                  { parent_id: query.locationId },
                  { parent: { parent_id: query.locationId } },
                ],
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: groupInclude,
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    const memberships = await this.memberships(
      userId,
      page.items.map((row) => row.id),
    );
    return {
      items: page.items.map((row) =>
        this.serialize(row, memberships.get(row.id) ?? null),
      ),
      nextCursor: page.nextCursor,
    };
  }

  /** My groups: active, pending requests and invitations. */
  async mine(userId: string) {
    const rows = await this.prisma.communityGroupMember.findMany({
      where: {
        user_id: userId,
        status: { in: [GroupMemberStatus.ACTIVE, GroupMemberStatus.PENDING] },
        group: { deleted_at: null },
      },
      include: { group: { include: groupInclude } },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
    return {
      items: rows
        .filter(
          (row) =>
            !row.group.hidden_at || row.role === GroupMemberRole.MODERATOR,
        )
        .map((row) => this.serialize(row.group, row)),
    };
  }

  /** Group details: public groups for anyone, private ones for members and invitees. */
  async get(userId: string, id: string) {
    const { group, membership } = await this.visible(userId, id);
    return this.serialize(group, membership);
  }

  async update(userId: string, id: string, input: UpdateGroupDto) {
    await this.moderated(userId, id);
    await this.assertReferences(
      input.locationId ?? undefined,
      input.categoryId ?? undefined,
    );
    await this.prisma.communityGroup.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        description:
          input.description === undefined
            ? undefined
            : input.description?.trim() || null,
        visibility: input.visibility,
        location_id: input.locationId,
        category_id: input.categoryId,
      },
    });
    await this.audit(userId, "COMMUNITY_GROUP_UPDATED", id, {
      fields: Object.keys(input),
    });
    await this.syncChat(id);
    return this.get(userId, id);
  }

  /**
   * Join a public group (at once), or ask to join a women-only one (a
   * moderator approves). An invitee accepts their invitation here too.
   */
  async join(userId: string, id: string) {
    const { group, membership } = await this.visible(userId, id);
    if (membership?.status === GroupMemberStatus.ACTIVE)
      throw communityErrors.alreadyMember();
    if (membership?.status === GroupMemberStatus.REMOVED)
      throw communityErrors.removed();
    if (group.women_only) await this.assertWoman(userId);
    const now = new Date();
    const invited =
      membership?.status === GroupMemberStatus.PENDING &&
      membership.invited_by_user_id;
    if (membership && !invited) throw communityErrors.alreadyMember();
    // Private groups are by invitation only (visible() already hid them otherwise).
    const approvalNeeded = !invited && group.women_only;
    if (membership)
      await this.prisma.communityGroupMember.update({
        where: { id: membership.id },
        data: { status: GroupMemberStatus.ACTIVE, joined_at: now },
      });
    else
      await this.prisma.communityGroupMember.create({
        data: {
          group_id: id,
          user_id: userId,
          status: approvalNeeded
            ? GroupMemberStatus.PENDING
            : GroupMemberStatus.ACTIVE,
          joined_at: approvalNeeded ? null : now,
        },
      });
    if (approvalNeeded)
      await this.notifyModerators(id, "COMMUNITY_JOIN_REQUEST", {
        title: "দলে যোগ দেওয়ার অনুরোধ",
        body: `${group.name} — কেউ যোগ দিতে চান। অনুমোদন দিন।`,
      });
    await this.syncChat(id);
    return this.get(userId, id);
  }

  async leave(userId: string, id: string) {
    const membership = await this.prisma.communityGroupMember.findUnique({
      where: { group_id_user_id: { group_id: id, user_id: userId } },
    });
    if (!membership || membership.status === GroupMemberStatus.REMOVED)
      throw communityErrors.notFound();
    if (
      membership.role === GroupMemberRole.MODERATOR &&
      (await this.moderatorCount(id)) <= 1
    )
      throw communityErrors.lastModerator();
    await this.prisma.communityGroupMember.delete({
      where: { id: membership.id },
    });
    await this.syncAmbassadorBadge(userId);
    await this.syncChat(id);
    return { groupId: id, left: true };
  }

  /** Active members, to members only; people in a block with you are left out. */
  async members(userId: string, id: string, query: GroupMembersQueryDto) {
    const { membership } = await this.visible(userId, id);
    if (membership?.status !== GroupMemberStatus.ACTIVE)
      throw communityErrors.notFound();
    const status = query.status ?? GroupMemberStatus.ACTIVE;
    if (
      status === GroupMemberStatus.PENDING &&
      membership.role !== GroupMemberRole.MODERATOR
    )
      throw communityErrors.notFound();
    const hidden = await this.blocks.hiddenFrom(userId);
    const limit = query.limit ?? 50;
    const rows = await this.prisma.communityGroupMember.findMany({
      where: { group_id: id, status, user_id: { notIn: hidden } },
      include: {
        user: {
          select: {
            profile: { select: { display_name: true, show_full_name: true } },
          },
        },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        userId: row.user_id,
        displayName: visibleDisplayName(row.user.profile?.display_name ?? "", {
          showFullName: row.user.profile?.show_full_name ?? false,
          hired: false,
        }),
        role: row.role,
        status: row.status,
        kind:
          row.status === GroupMemberStatus.PENDING
            ? row.invited_by_user_id
              ? "INVITATION"
              : "REQUEST"
            : null,
        joinedAt: row.joined_at?.toISOString() ?? null,
      })),
      nextCursor: page.nextCursor,
    };
  }

  /** A moderator invites people (they accept with join). */
  async invite(userId: string, id: string, input: InviteGroupMembersDto) {
    const group = await this.moderated(userId, id);
    const hidden = new Set(await this.blocks.hiddenFrom(userId));
    const existing = new Set(
      (
        await this.prisma.communityGroupMember.findMany({
          where: { group_id: id, user_id: { in: input.userIds } },
          select: { user_id: true },
        })
      ).map((row) => row.user_id),
    );
    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: input.userIds.filter(
            (user) => !hidden.has(user) && !existing.has(user),
          ),
        },
        status: UserStatus.ACTIVE,
        deleted_at: null,
        ...(group.women_only ? { profile: { gender: Gender.FEMALE } } : {}),
      },
      select: { id: true },
    });
    if (users.length)
      await this.prisma.communityGroupMember.createMany({
        data: users.map((user) => ({
          group_id: id,
          user_id: user.id,
          status: GroupMemberStatus.PENDING,
          invited_by_user_id: userId,
        })),
        skipDuplicates: true,
      });
    for (const user of users)
      await this.notifications?.create({
        userId: user.id,
        type: "COMMUNITY_INVITATION",
        title: "দলে যোগ দেওয়ার আমন্ত্রণ",
        body: `${group.name} — আপনাকে আমন্ত্রণ জানানো হয়েছে।`,
        payload: { route: `/community/groups/${id}`, groupId: id },
        dedupeKey: `community-invite:${id}:${user.id}`,
      });
    return { groupId: id, invited: users.map((user) => user.id) };
  }

  /** A moderator approves a join request. */
  async approve(userId: string, id: string, memberUserId: string) {
    const group = await this.moderated(userId, id);
    const row = await this.prisma.communityGroupMember.findUnique({
      where: { group_id_user_id: { group_id: id, user_id: memberUserId } },
    });
    if (
      !row ||
      row.status !== GroupMemberStatus.PENDING ||
      row.invited_by_user_id
    )
      throw communityErrors.transition();
    if (await this.blocks.between(userId, memberUserId))
      throw communityErrors.notFound();
    await this.prisma.communityGroupMember.update({
      where: { id: row.id },
      data: { status: GroupMemberStatus.ACTIVE, joined_at: new Date() },
    });
    await this.notifications?.create({
      userId: memberUserId,
      type: "COMMUNITY_JOIN_APPROVED",
      title: "দলে যোগ দিয়েছেন",
      body: `${group.name} — আপনার অনুরোধ অনুমোদিত হয়েছে।`,
      payload: { route: `/community/groups/${id}`, groupId: id },
      dedupeKey: `community-approved:${id}:${memberUserId}`,
    });
    await this.syncChat(id);
    return this.members(userId, id, { status: GroupMemberStatus.PENDING });
  }

  async changeRole(
    userId: string,
    id: string,
    memberUserId: string,
    input: GroupMemberRoleDto,
  ) {
    await this.moderated(userId, id);
    const row = await this.prisma.communityGroupMember.findUnique({
      where: { group_id_user_id: { group_id: id, user_id: memberUserId } },
    });
    if (!row || row.status !== GroupMemberStatus.ACTIVE)
      throw communityErrors.notFound();
    if (
      row.role === GroupMemberRole.MODERATOR &&
      input.role !== GroupMemberRole.MODERATOR &&
      (await this.moderatorCount(id)) <= 1
    )
      throw communityErrors.lastModerator();
    await this.prisma.communityGroupMember.update({
      where: { id: row.id },
      data: { role: input.role },
    });
    await this.syncAmbassadorBadge(memberUserId);
    await this.audit(userId, "COMMUNITY_MEMBER_ROLE_CHANGED", id, {
      userId: memberUserId,
      from: row.role,
      to: input.role,
    });
    return this.members(userId, id, {});
  }

  /** A moderator removes someone (or declines a request / cancels an invite). */
  async remove(userId: string, id: string, memberUserId: string) {
    await this.moderated(userId, id);
    const row = await this.prisma.communityGroupMember.findUnique({
      where: { group_id_user_id: { group_id: id, user_id: memberUserId } },
    });
    if (!row || row.status === GroupMemberStatus.REMOVED)
      throw communityErrors.notFound();
    if (
      row.role === GroupMemberRole.MODERATOR &&
      (await this.moderatorCount(id)) <= 1
    )
      throw communityErrors.lastModerator();
    if (row.status === GroupMemberStatus.PENDING)
      await this.prisma.communityGroupMember.delete({ where: { id: row.id } });
    else
      await this.prisma.communityGroupMember.update({
        where: { id: row.id },
        data: {
          status: GroupMemberStatus.REMOVED,
          removed_at: new Date(),
          role: GroupMemberRole.MEMBER,
        },
      });
    await this.syncAmbassadorBadge(memberUserId);
    await this.audit(userId, "COMMUNITY_MEMBER_REMOVED", id, {
      userId: memberUserId,
    });
    await this.syncChat(id);
    return { groupId: id, userId: memberUserId, removed: true };
  }

  /**
   * P3.6: a moderator or ambassador posts an announcement: a SYSTEM message
   * in the group chat, attributed to them, and a notification to members.
   */
  async announce(userId: string, id: string, body: string) {
    const { group, membership } = await this.visible(userId, id);
    if (
      membership?.status !== GroupMemberStatus.ACTIVE ||
      (membership.role !== GroupMemberRole.MODERATOR &&
        membership.role !== GroupMemberRole.AMBASSADOR)
    )
      throw communityErrors.notFound();
    if (!this.chat) throw new Error("ChatService is not available.");
    const conversationId = (await this.syncChat(id, true))!;
    const posted = await this.chat.postAnnouncement(
      conversationId,
      userId,
      body.trim(),
    );
    const at = Date.now();
    for (const recipient of posted.recipients)
      await this.notifications?.create({
        userId: recipient,
        type: "COMMUNITY_ANNOUNCEMENT",
        title: `${group.name} — ঘোষণা`,
        body: body.trim().slice(0, 140),
        payload: {
          route: `/community/groups/${id}/announcements`,
          groupId: id,
          conversationId,
        },
        dedupeKey: `community-announcement:${posted.message.id}:${recipient}:${at}`,
      });
    await this.audit(userId, "COMMUNITY_ANNOUNCEMENT_POSTED", id, {
      messageId: posted.message.id,
    });
    return this.announcements(userId, id);
  }

  /** The group's announcements, newest first (members only). */
  async announcements(userId: string, id: string) {
    const { membership } = await this.visible(userId, id);
    if (membership?.status !== GroupMemberStatus.ACTIVE)
      throw communityErrors.notFound();
    const conversation = await this.prisma.conversation.findUnique({
      where: { scope_key: `community-group:${id}` },
      select: { id: true },
    });
    if (!conversation) return { items: [] };
    const hidden = await this.blocks.hiddenFrom(userId);
    const rows = await this.prisma.message.findMany({
      where: {
        conversation_id: conversation.id,
        type: "SYSTEM",
        deleted_at: null,
        sender_user_id: { not: null, notIn: hidden },
      },
      include: {
        sender: {
          select: {
            profile: { select: { display_name: true, show_full_name: true } },
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 50,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        body: row.body,
        postedBy: {
          userId: row.sender_user_id,
          displayName: visibleDisplayName(
            row.sender?.profile?.display_name ?? "",
            {
              showFullName: row.sender?.profile?.show_full_name ?? false,
              hired: false,
            },
          ),
        },
        createdAt: row.created_at.toISOString(),
      })),
    };
  }

  /** The group chat for active members. */
  async chatRoom(userId: string, id: string) {
    const { membership } = await this.visible(userId, id);
    if (membership?.status !== GroupMemberStatus.ACTIVE)
      throw communityErrors.notFound();
    return { groupId: id, conversationId: await this.syncChat(id, true) };
  }

  /**
   * What the viewer may see of a group, or 404: deleted, hidden (except to
   * its moderators), private (except to members and invitees), removed.
   */
  async visible(userId: string, id: string) {
    const group = await this.prisma.communityGroup.findFirst({
      where: { id, deleted_at: null },
      include: groupInclude,
    });
    if (!group) throw communityErrors.notFound();
    const membership = await this.prisma.communityGroupMember.findUnique({
      where: { group_id_user_id: { group_id: id, user_id: userId } },
      select: { id: true, role: true, status: true, invited_by_user_id: true },
    });
    const active = membership?.status === GroupMemberStatus.ACTIVE;
    if (
      group.hidden_at &&
      !(active && membership?.role === GroupMemberRole.MODERATOR)
    )
      throw communityErrors.notFound();
    if (group.visibility === GroupVisibility.PRIVATE) {
      const invited =
        membership?.status === GroupMemberStatus.PENDING &&
        membership.invited_by_user_id;
      if (!active && !invited) throw communityErrors.notFound();
    }
    return { group, membership };
  }

  async moderated(userId: string, id: string) {
    const { group, membership } = await this.visible(userId, id);
    if (
      membership?.status !== GroupMemberStatus.ACTIVE ||
      membership.role !== GroupMemberRole.MODERATOR
    )
      throw communityErrors.notFound();
    return group;
  }

  serialize(row: GroupRow, membership: Membership) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      womenOnly: row.women_only,
      area: row.location
        ? {
            id: row.location.id,
            nameEn: row.location.name_en,
            nameBn: row.location.name_bn,
          }
        : null,
      category: row.category
        ? {
            id: row.category.id,
            nameEn: row.category.name_en,
            nameBn: row.category.name_bn,
          }
        : null,
      memberCount: row._count.members,
      myMembership: membership
        ? {
            role: membership.role,
            status: membership.status,
            invited:
              membership.status === GroupMemberStatus.PENDING &&
              Boolean(membership.invited_by_user_id),
          }
        : null,
      status: row.hidden_at ? "HIDDEN" : "ACTIVE",
      createdAt: row.created_at.toISOString(),
    };
  }

  /**
   * P3.6: the "Community ambassador" badge follows the role: held while
   * the person is an AMBASSADOR of at least one active, visible group.
   */
  async syncAmbassadorBadge(userId: string) {
    const badge = await this.prisma.badge.upsert({
      where: { slug: AMBASSADOR_BADGE.slug },
      update: {},
      create: {
        ...AMBASSADOR_BADGE,
        rule_json: { communityRole: "AMBASSADOR" },
      },
      select: { id: true },
    });
    const ambassador = await this.prisma.communityGroupMember.count({
      where: {
        user_id: userId,
        role: GroupMemberRole.AMBASSADOR,
        status: GroupMemberStatus.ACTIVE,
        group: { deleted_at: null, hidden_at: null },
      },
    });
    const current = await this.prisma.userBadge.findUnique({
      where: { user_id_badge_id: { user_id: userId, badge_id: badge.id } },
    });
    if (ambassador && (!current || current.revoked_at)) {
      await this.prisma.userBadge.upsert({
        where: { user_id_badge_id: { user_id: userId, badge_id: badge.id } },
        create: { user_id: userId, badge_id: badge.id },
        update: { revoked_at: null, granted_at: new Date() },
      });
    } else if (!ambassador && current && !current.revoked_at) {
      await this.prisma.userBadge.update({
        where: { user_id_badge_id: { user_id: userId, badge_id: badge.id } },
        data: { revoked_at: new Date() },
      });
    }
  }

  /** Keeps the group chat's members equal to the active members. */
  private async syncChat(id: string, create = false) {
    if (!this.chat) return null;
    const [group, members] = await Promise.all([
      this.prisma.communityGroup.findUniqueOrThrow({
        where: { id },
        select: { name: true },
      }),
      this.prisma.communityGroupMember.findMany({
        where: { group_id: id, status: GroupMemberStatus.ACTIVE },
        select: { user_id: true },
      }),
    ]);
    const input = {
      scopeKey: `community-group:${id}`,
      title: group.name,
      subjectType: "COMMUNITY_GROUP",
      subjectId: id,
      memberIds: members.map((row) => row.user_id),
    };
    if (create) return this.chat.syncGroup(input);
    await this.chat.syncGroupIfExists(input);
    return null;
  }

  private async memberships(userId: string, groupIds: string[]) {
    const rows = await this.prisma.communityGroupMember.findMany({
      where: { user_id: userId, group_id: { in: groupIds } },
      select: {
        id: true,
        group_id: true,
        role: true,
        status: true,
        invited_by_user_id: true,
      },
    });
    return new Map(rows.map((row) => [row.group_id, row]));
  }

  private moderatorCount(id: string) {
    return this.prisma.communityGroupMember.count({
      where: {
        group_id: id,
        role: GroupMemberRole.MODERATOR,
        status: GroupMemberStatus.ACTIVE,
      },
    });
  }

  private async notifyModerators(
    id: string,
    type: string,
    text: { title: string; body: string },
  ) {
    const moderators = await this.prisma.communityGroupMember.findMany({
      where: {
        group_id: id,
        role: GroupMemberRole.MODERATOR,
        status: GroupMemberStatus.ACTIVE,
      },
      select: { user_id: true },
    });
    const at = Date.now();
    for (const row of moderators)
      await this.notifications?.create({
        userId: row.user_id,
        type,
        title: text.title,
        body: text.body,
        payload: { route: `/community/groups/${id}/members`, groupId: id },
        dedupeKey: `${type}:${id}:${row.user_id}:${at}`,
      });
  }

  private async assertWoman(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { gender: true },
    });
    if (profile?.gender !== Gender.FEMALE) throw communityErrors.womenOnly();
  }

  private async assertReferences(locationId?: string, categoryId?: string) {
    const [location, category] = await Promise.all([
      locationId
        ? this.prisma.location.count({
            where: { id: locationId, is_active: true },
          })
        : 1,
      categoryId
        ? this.prisma.category.count({
            where: { id: categoryId, is_active: true },
          })
        : 1,
    ]);
    if (!location || !category)
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: location ? "Unknown category." : "Unknown area.",
        messageKey: "error.validation.failed",
        field: location ? "categoryId" : "locationId",
      });
  }

  private audit(
    userId: string,
    action: string,
    id: string,
    after: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actor_user_id: userId,
        action,
        entity: "CommunityGroup",
        entity_id: id,
        after_json: after,
      },
    });
  }
}
