import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import {
  BusinessMemberRole,
  BusinessStage,
  Prisma,
  UserStatus,
  VerificationStatus,
} from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { visibleDisplayName } from "../users/public-profile.projection";
import { businessErrors } from "./business.errors";
import {
  isVerifiedBusiness,
  PUBLIC_BUSINESS,
  STAGE_LABEL,
} from "./business-labels";
import {
  CreateBusinessDto,
  InviteBusinessMemberDto,
  UpdateBusinessDto,
} from "./dto/business.dto";

const MAX_OWNED = 5;
const MAX_MEMBERS = 50;

export const businessInclude = {
  category: { select: { id: true, slug: true, name_en: true, name_bn: true } },
  location: { select: { id: true, name_en: true, name_bn: true } },
  members: {
    where: { accepted_at: { not: null } },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      user_id: true,
      role: true,
      user: {
        select: {
          profile: {
            select: {
              display_name: true,
              show_full_name: true,
              trust_level: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.BusinessProfileInclude;

export type BusinessRow = Prisma.BusinessProfileGetPayload<{
  include: typeof businessInclude;
}>;

/** The parts of a business anyone may see. */
export function publicBusiness(row: BusinessRow) {
  const owner = row.members.find(
    (member) => member.role === BusinessMemberRole.OWNER,
  );
  const profile = owner?.user.profile;
  return {
    id: row.id,
    name: row.business_name,
    stage: row.stage,
    stageLabel: STAGE_LABEL[row.stage],
    description: row.description,
    category: row.category
      ? {
          id: row.category.id,
          slug: row.category.slug,
          nameEn: row.category.name_en,
          nameBn: row.category.name_bn,
        }
      : null,
    area: row.location
      ? {
          id: row.location.id,
          nameEn: row.location.name_en,
          nameBn: row.location.name_bn,
        }
      : null,
    employeesCount: row.employees_count,
    isPublic: row.is_public,
    seekingPartners: row.seeking_partners,
    verified: isVerifiedBusiness(row),
    owner: owner
      ? {
          userId: owner.user_id,
          displayName: visibleDisplayName(profile?.display_name ?? "", {
            showFullName: profile?.show_full_name ?? false,
            hired: false,
          }),
          trustLevel: profile?.trust_level ?? "NONE",
        }
      : null,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * P2.1: business profiles (stage IDEA, INFORMAL or REGISTERED) and the
 * people who act for them (OWNER, MANAGER, STAFF). Private until published;
 * a business only shows as verified when it is REGISTERED and approved.
 */
@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly userBlocks?: UserBlocksService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  /** The active sector taxonomy, parents first. */
  async categories() {
    const rows = await this.prisma.businessCategory.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: "asc" }, { slug: "asc" }],
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        parentId: row.parent_id,
        slug: row.slug,
        nameEn: row.name_en,
        nameBn: row.name_bn,
        icon: row.icon,
      })),
    };
  }

  /** My businesses (as a member) and invitations waiting for me. */
  async mine(userId: string) {
    const memberships = await this.prisma.businessMember.findMany({
      where: { user_id: userId, business: { deleted_at: null } },
      include: { business: { include: businessInclude } },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
    return {
      items: memberships
        .filter((membership) => membership.accepted_at)
        .map((membership) =>
          this.memberView(membership.business, membership.role),
        ),
      invitations: memberships
        .filter((membership) => !membership.accepted_at)
        .map((membership) => ({
          business: publicBusiness(membership.business),
          role: membership.role,
          invitedAt: membership.created_at.toISOString(),
        })),
    };
  }

  async create(userId: string, input: CreateBusinessDto) {
    const owned = await this.prisma.businessMember.count({
      where: {
        user_id: userId,
        role: BusinessMemberRole.OWNER,
        accepted_at: { not: null },
        business: { deleted_at: null },
      },
    });
    if (owned >= MAX_OWNED) throw businessErrors.limitReached();
    await this.assertReferences(input.categoryId, input.locationId);
    if (input.isPublic) this.assertPublishable(input);
    const business = await this.prisma.businessProfile.create({
      data: {
        user_id: userId,
        business_name: input.name.trim(),
        stage: input.stage ?? BusinessStage.INFORMAL,
        description: input.description?.trim() || null,
        category_id: input.categoryId ?? null,
        location_id: input.locationId ?? null,
        address: input.address?.trim() || null,
        contact_person: input.contactPerson?.trim() || null,
        trade_licence_no: input.tradeLicenceNo?.trim() || null,
        employees_count: input.employeesCount ?? null,
        is_public: input.isPublic ?? false,
        seeking_partners: input.seekingPartners ?? false,
        members: {
          create: {
            user_id: userId,
            role: BusinessMemberRole.OWNER,
            accepted_at: new Date(),
          },
        },
      },
      select: { id: true },
    });
    await this.audit(userId, "BUSINESS_CREATED", business.id, {
      stage: input.stage ?? BusinessStage.INFORMAL,
    });
    return this.get(userId, business.id);
  }

  /**
   * A member sees everything; anyone else sees the public parts of a
   * public, active business they are not in a block with; otherwise 404.
   */
  async get(viewerUserId: string | undefined, id: string) {
    const row = await this.prisma.businessProfile.findFirst({
      where: { id, deleted_at: null },
      include: businessInclude,
    });
    if (!row) throw businessErrors.notFound();
    const membership = viewerUserId
      ? row.members.find((member) => member.user_id === viewerUserId)
      : undefined;
    if (membership) return this.memberView(row, membership.role);
    if (!row.is_public || row.suspended_at) throw businessErrors.notFound();
    if (viewerUserId && (await this.blockedWithOwners(viewerUserId, row)))
      throw businessErrors.notFound();
    return { ...publicBusiness(row), myRole: null };
  }

  async update(userId: string, id: string, input: UpdateBusinessDto) {
    const current = await this.activeBusiness(id);
    await this.assertReferences(
      input.categoryId ?? undefined,
      input.locationId ?? undefined,
    );
    const next = {
      categoryId:
        input.categoryId === undefined ? current.category_id : input.categoryId,
      locationId:
        input.locationId === undefined ? current.location_id : input.locationId,
    };
    const isPublic = input.isPublic ?? current.is_public;
    if (isPublic) this.assertPublishable(next);

    const stage = input.stage ?? current.stage;
    // The verified badge belongs to a registered business with these exact
    // details: leaving REGISTERED, or changing the name or licence number,
    // needs a new verification.
    const invalidatesVerification =
      current.verification_status === VerificationStatus.APPROVED &&
      (stage !== BusinessStage.REGISTERED ||
        (input.name !== undefined &&
          input.name.trim() !== current.business_name) ||
        (input.tradeLicenceNo !== undefined &&
          (input.tradeLicenceNo?.trim() || null) !== current.trade_licence_no));
    const text = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() || null;
    await this.prisma.businessProfile.update({
      where: { id },
      data: {
        business_name: input.name?.trim(),
        stage: input.stage,
        description: text(input.description),
        category_id: input.categoryId,
        location_id: input.locationId,
        address: text(input.address),
        contact_person: text(input.contactPerson),
        trade_licence_no: text(input.tradeLicenceNo),
        employees_count: input.employeesCount,
        is_public: input.isPublic,
        seeking_partners: input.seekingPartners,
        ...(invalidatesVerification
          ? { verification_status: VerificationStatus.NOT_SUBMITTED }
          : {}),
      },
    });
    await this.audit(userId, "BUSINESS_UPDATED", id, {
      fields: Object.keys(input),
      verificationReset: invalidatesVerification,
    });
    return this.get(userId, id);
  }

  /** An owner deletes the business (soft delete; it disappears everywhere). */
  async remove(userId: string, id: string) {
    await this.prisma.businessProfile.update({
      where: { id },
      data: { deleted_at: new Date(), is_public: false },
    });
    await this.audit(userId, "BUSINESS_DELETED", id, {});
    return { id, deleted: true };
  }

  async members(id: string) {
    const rows = await this.prisma.businessMember.findMany({
      where: { business_profile_id: id },
      include: {
        user: {
          select: { profile: { select: { display_name: true } } },
        },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
    return {
      items: rows.map((row) => ({
        userId: row.user_id,
        // Members of one business work together: full names among them.
        displayName: row.user.profile?.display_name?.trim() ?? "",
        role: row.role,
        status: row.accepted_at ? "ACTIVE" : "INVITED",
        invitedAt: row.created_at.toISOString(),
        acceptedAt: row.accepted_at?.toISOString() ?? null,
      })),
    };
  }

  /** An owner invites someone; they become a member when they accept. */
  async invite(
    ownerUserId: string,
    id: string,
    input: InviteBusinessMemberDto,
  ) {
    const business = await this.activeBusiness(id);
    const invitee = await this.prisma.user.findFirst({
      where: {
        id: input.userId,
        status: UserStatus.ACTIVE,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (
      !invitee ||
      invitee.id === ownerUserId ||
      (await this.blocks.between(ownerUserId, invitee.id))
    )
      throw businessErrors.notFound();
    const count = await this.prisma.businessMember.count({
      where: { business_profile_id: id },
    });
    if (count >= MAX_MEMBERS) throw businessErrors.memberLimit();
    await this.prisma.businessMember
      .create({
        data: {
          business_profile_id: id,
          user_id: invitee.id,
          role: input.role,
          invited_by_user_id: ownerUserId,
        },
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw businessErrors.alreadyMember();
        throw error;
      });
    await this.audit(ownerUserId, "BUSINESS_MEMBER_INVITED", id, {
      userId: invitee.id,
      role: input.role,
    });
    await this.notifications?.create({
      userId: invitee.id,
      type: "BUSINESS_INVITATION",
      title: "ব্যবসায় যোগ দেওয়ার আমন্ত্রণ",
      body: `${business.business_name} আপনাকে দলে যোগ দিতে আমন্ত্রণ জানিয়েছে।`,
      payload: { route: `/businesses/${id}`, businessId: id },
      dedupeKey: `business-invite:${id}:${invitee.id}:${Date.now()}`,
    });
    return this.members(id);
  }

  async acceptInvitation(userId: string, id: string) {
    const invitation = await this.prisma.businessMember.findFirst({
      where: {
        business_profile_id: id,
        user_id: userId,
        business: { deleted_at: null },
      },
    });
    if (!invitation) throw businessErrors.notFound();
    if (!invitation.accepted_at) {
      await this.prisma.businessMember.update({
        where: { id: invitation.id },
        data: { accepted_at: new Date() },
      });
      await this.audit(userId, "BUSINESS_MEMBER_JOINED", id, {
        role: invitation.role,
      });
    }
    return this.get(userId, id);
  }

  /** Leave a business, or decline an invitation. */
  async leave(userId: string, id: string) {
    const membership = await this.prisma.businessMember.findFirst({
      where: { business_profile_id: id, user_id: userId },
    });
    if (!membership) throw businessErrors.notFound();
    await this.removeMembership(userId, membership);
    return { businessId: id, left: true };
  }

  async changeRole(
    ownerUserId: string,
    id: string,
    memberUserId: string,
    role: BusinessMemberRole,
  ) {
    await this.activeBusiness(id);
    const membership = await this.prisma.businessMember.findFirst({
      where: { business_profile_id: id, user_id: memberUserId },
    });
    if (!membership) throw businessErrors.notFound();
    if (
      membership.role === BusinessMemberRole.OWNER &&
      role !== BusinessMemberRole.OWNER &&
      (await this.ownerCount(id)) <= 1
    )
      throw businessErrors.lastOwner();
    await this.prisma.businessMember.update({
      where: { id: membership.id },
      data: { role },
    });
    await this.audit(ownerUserId, "BUSINESS_MEMBER_ROLE_CHANGED", id, {
      userId: memberUserId,
      from: membership.role,
      to: role,
    });
    return this.members(id);
  }

  async removeMember(ownerUserId: string, id: string, memberUserId: string) {
    const membership = await this.prisma.businessMember.findFirst({
      where: { business_profile_id: id, user_id: memberUserId },
    });
    if (!membership) throw businessErrors.notFound();
    await this.removeMembership(ownerUserId, membership);
    return this.members(id);
  }

  /** Member view: everything, plus the viewer's role. */
  memberView(row: BusinessRow, role: BusinessMemberRole) {
    return {
      ...publicBusiness(row),
      status: row.suspended_at ? "SUSPENDED" : "ACTIVE",
      address: row.address,
      contactPerson: row.contact_person,
      tradeLicenceNo: row.trade_licence_no,
      verificationStatus: row.verification_status,
      updatedAt: row.updated_at.toISOString(),
      myRole: role,
    };
  }

  private async removeMembership(
    actorUserId: string,
    membership: {
      id: string;
      business_profile_id: string;
      user_id: string;
      role: BusinessMemberRole;
      accepted_at: Date | null;
    },
  ) {
    if (
      membership.role === BusinessMemberRole.OWNER &&
      membership.accepted_at &&
      (await this.ownerCount(membership.business_profile_id)) <= 1
    )
      throw businessErrors.lastOwner();
    await this.prisma.businessMember.delete({ where: { id: membership.id } });
    await this.audit(
      actorUserId,
      "BUSINESS_MEMBER_REMOVED",
      membership.business_profile_id,
      { userId: membership.user_id, role: membership.role },
    );
  }

  private ownerCount(id: string) {
    return this.prisma.businessMember.count({
      where: {
        business_profile_id: id,
        role: BusinessMemberRole.OWNER,
        accepted_at: { not: null },
      },
    });
  }

  /** A business its members may change: not deleted, not suspended. */
  private async activeBusiness(id: string) {
    const business = await this.prisma.businessProfile.findFirst({
      where: { id, deleted_at: null },
    });
    if (!business) throw businessErrors.notFound();
    if (business.suspended_at) throw businessErrors.suspended();
    return business;
  }

  private async blockedWithOwners(viewerUserId: string, row: BusinessRow) {
    const hidden = new Set(await this.blocks.hiddenFrom(viewerUserId));
    return row.members.some(
      (member) =>
        member.role === BusinessMemberRole.OWNER && hidden.has(member.user_id),
    );
  }

  private assertPublishable(input: {
    categoryId?: string | null;
    locationId?: string | null;
  }) {
    if (!input.categoryId) throw businessErrors.incomplete("categoryId");
    if (!input.locationId) throw businessErrors.incomplete("locationId");
  }

  private async assertReferences(categoryId?: string, locationId?: string) {
    const [category, location] = await Promise.all([
      categoryId
        ? this.prisma.businessCategory.count({
            where: { id: categoryId, is_active: true },
          })
        : 1,
      locationId
        ? this.prisma.location.count({
            where: { id: locationId, is_active: true },
          })
        : 1,
    ]);
    if (!category)
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Unknown business sector.",
        messageKey: "error.validation.failed",
        field: "categoryId",
      });
    if (!location)
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Unknown area.",
        messageKey: "error.validation.failed",
        field: "locationId",
      });
  }

  private audit(
    actorUserId: string,
    action: string,
    businessId: string,
    after: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actor_user_id: actorUserId,
        action,
        entity: "BusinessProfile",
        entity_id: businessId,
        after_json: after,
      },
    });
  }
}
