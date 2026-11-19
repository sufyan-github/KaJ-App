import { createHash, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminRole, Prisma, UserStatus } from "@prisma/client";
import { hash } from "bcryptjs";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { encryptTotpSecret } from "../admin-auth/admin-auth.primitives";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import { StaffInviteDto, StaffRoleDto } from "./dto/admin-staff.dto";
import {
  staffEmailInUseError,
  staffLastAdminError,
  staffNotFoundError,
  staffSelfChangeError,
  staffStateError,
} from "./admin-staff.errors";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 without padding, as authenticator apps expect. */
export function base32Encode(bytes: Buffer): string {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let offset = 0; offset < bits.length; offset += 5)
    out +=
      BASE32[Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2)];
  return out;
}

/** Credentials shown once to the inviting administrator, never stored. */
export interface IssuedCredentials {
  temporaryPassword: string;
  totpSecret: string;
  otpauthUri: string;
}

type StaffRow = Prisma.UserGetPayload<{
  include: { admin_credential: true; profile: true };
}>;

/**
 * Staff accounts: users with an admin credential. Only ADMIN reaches these
 * routes (see the controller). A staff member is active while `is_admin` is
 * true and the user is ACTIVE; sign-in and every session check already
 * require both, so deactivating needs no change to admin authentication.
 */
@Injectable()
export class AdminStaffService {
  private readonly totpEncryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // Same key and local fallback as AdminAuthService, which decrypts it.
    this.totpEncryptionKey =
      config.get<string>("ADMIN_TOTP_ENCRYPTION_KEY") ||
      createHash("sha256")
        .update("kaj:admin-totp:local-development-only")
        .digest("hex");
  }

  async list(actor: AdminActor, context: AdminRequestContext) {
    const rows = await this.prisma.user.findMany({
      where: { admin_credential: { isNot: null } },
      include: { admin_credential: true, profile: true },
      orderBy: { created_at: "asc" },
    });
    const lastActive = await this.prisma.adminSession.groupBy({
      by: ["user_id"],
      where: { user_id: { in: rows.map((row) => row.id) } },
      _max: { last_active_at: true },
    });
    const lastActiveBy = new Map(
      lastActive.map((row) => [row.user_id, row._max.last_active_at]),
    );
    await this.audit(actor, "ADMIN_STAFF_VIEWED", null, null, null, context);
    return {
      items: rows.map((row) => ({
        ...serializeStaff(row),
        lastActiveAt: lastActiveBy.get(row.id) ?? null,
      })),
    };
  }

  async invite(
    input: StaffInviteDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) throw staffEmailInUseError();
    const credentials = this.issueCredentials(input.email);
    const created = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: input.email,
          password_hash: await hash(credentials.temporaryPassword, 12),
          status: UserStatus.ACTIVE,
          is_admin: true,
          profile: { create: { display_name: input.displayName } },
          admin_credential: {
            create: {
              role: input.role,
              totp_secret_ciphertext: encryptTotpSecret(
                credentials.totpSecret,
                this.totpEncryptionKey,
              ),
              // There is no self-service enrolment yet: the authenticator is
              // set up from the one-time details handed over in person.
              totp_confirmed_at: new Date(),
            },
          },
        },
        include: { admin_credential: true, profile: true },
      });
      await transaction.auditLog.create({
        data: auditData(
          actor,
          "ADMIN_STAFF_INVITED",
          user.id,
          null,
          { email: input.email, role: input.role, reason: input.reason },
          context,
        ),
      });
      return user;
    });
    return { staff: serializeStaff(created), credentials };
  }

  async changeRole(
    userId: string,
    input: StaffRoleDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const staff = await this.lockStaff(transaction, userId, actor);
      const before = staff.admin_credential!.role;
      if (before === input.role) return serializeStaff(staff);
      if (before === AdminRole.ADMIN && isActive(staff))
        await this.requireAnotherAdmin(transaction, userId);
      const updated = await transaction.user.update({
        where: { id: userId },
        data: { admin_credential: { update: { role: input.role } } },
        include: { admin_credential: true, profile: true },
      });
      await transaction.auditLog.create({
        data: auditData(
          actor,
          "ADMIN_STAFF_ROLE_CHANGED",
          userId,
          { role: before },
          { role: input.role, reason: input.reason },
          context,
        ),
      });
      return serializeStaff(updated);
    });
  }

  async deactivate(
    userId: string,
    reason: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const staff = await this.lockStaff(transaction, userId, actor);
      if (!staff.is_admin) throw staffStateError("Already deactivated.");
      if (staff.admin_credential!.role === AdminRole.ADMIN && isActive(staff))
        await this.requireAnotherAdmin(transaction, userId);
      const now = new Date();
      const updated = await transaction.user.update({
        where: { id: userId },
        data: { is_admin: false },
        include: { admin_credential: true, profile: true },
      });
      const revoked = await transaction.adminSession.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: now },
      });
      await transaction.adminLoginChallenge.updateMany({
        where: { user_id: userId, consumed_at: null },
        data: { consumed_at: now },
      });
      await transaction.auditLog.create({
        data: auditData(
          actor,
          "ADMIN_STAFF_DEACTIVATED",
          userId,
          { active: true },
          { active: false, revokedSessions: revoked.count, reason },
          context,
        ),
      });
      return serializeStaff(updated);
    });
  }

  /**
   * Gives a deactivated staff member access again with new credentials: the
   * old password and authenticator may have been left behind with them.
   */
  async reactivate(
    userId: string,
    reason: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const staff = await this.lockStaff(transaction, userId, actor);
      if (staff.is_admin) throw staffStateError("Already active.");
      if (!staff.email) throw staffStateError("This account has no email.");
      if (staff.status !== UserStatus.ACTIVE)
        throw staffStateError(
          "The user account is moderated; restore it in Users first.",
        );
      const credentials = this.issueCredentials(staff.email);
      const updated = await transaction.user.update({
        where: { id: userId },
        data: {
          is_admin: true,
          password_hash: await hash(credentials.temporaryPassword, 12),
          admin_credential: {
            update: {
              totp_secret_ciphertext: encryptTotpSecret(
                credentials.totpSecret,
                this.totpEncryptionKey,
              ),
              totp_confirmed_at: new Date(),
              last_totp_counter: null,
            },
          },
        },
        include: { admin_credential: true, profile: true },
      });
      await transaction.auditLog.create({
        data: auditData(
          actor,
          "ADMIN_STAFF_REACTIVATED",
          userId,
          { active: false },
          { active: true, credentialsReissued: true, reason },
          context,
        ),
      });
      return { staff: serializeStaff(updated), credentials };
    });
    return result;
  }

  private issueCredentials(email: string): IssuedCredentials {
    const totpSecret = base32Encode(randomBytes(20));
    const issuer = encodeURIComponent("KAAJ Operations");
    return {
      temporaryPassword: randomBytes(18).toString("base64url"),
      totpSecret,
      otpauthUri: `otpauth://totp/${issuer}:${encodeURIComponent(email)}?secret=${totpSecret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
    };
  }

  /**
   * Serialises staff changes (one advisory lock for all of them, so two
   * administrators demoting each other cannot both pass the last-ADMIN check
   * and cannot deadlock) and loads the target; refuses the actor's own account.
   */
  private async lockStaff(
    transaction: Prisma.TransactionClient,
    userId: string,
    actor: AdminActor,
  ): Promise<StaffRow> {
    if (userId === actor.userId) throw staffSelfChangeError();
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('kaj:admin-staff'))`;
    const staff = await transaction.user.findUnique({
      where: { id: userId },
      include: { admin_credential: true, profile: true },
    });
    if (!staff?.admin_credential) throw staffNotFoundError();
    return staff;
  }

  /** Never leave the console without an active ADMIN. */
  private async requireAnotherAdmin(
    transaction: Prisma.TransactionClient,
    excludingUserId: string,
  ) {
    const others = await transaction.user.count({
      where: {
        id: { not: excludingUserId },
        is_admin: true,
        status: UserStatus.ACTIVE,
        deleted_at: null,
        admin_credential: { role: AdminRole.ADMIN },
      },
    });
    if (!others) throw staffLastAdminError();
  }

  private async audit(
    actor: AdminActor,
    action: string,
    entityId: string | null,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue | null,
    context: AdminRequestContext,
  ) {
    await this.prisma.auditLog.create({
      data: auditData(actor, action, entityId, before, after, context),
    });
  }
}

function isActive(staff: StaffRow) {
  return (
    staff.is_admin && staff.status === UserStatus.ACTIVE && !staff.deleted_at
  );
}

function serializeStaff(staff: StaffRow) {
  return {
    userId: staff.id,
    email: staff.email,
    name: staff.profile?.display_name ?? null,
    role: staff.admin_credential?.role ?? null,
    active: isActive(staff),
    userStatus: staff.status,
    createdAt: staff.created_at,
  };
}

function auditData(
  actor: AdminActor,
  action: string,
  entityId: string | null,
  before: Prisma.InputJsonValue | null,
  after: Prisma.InputJsonValue | null,
  context: AdminRequestContext,
): Prisma.AuditLogUncheckedCreateInput {
  return {
    actor_user_id: actor.userId,
    action,
    entity: "ADMIN_STAFF",
    entity_id: entityId,
    before_json: before ?? Prisma.JsonNull,
    after_json: after ?? Prisma.JsonNull,
    ip: context.ip,
    ua: context.ua,
  };
}
