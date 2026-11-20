import { Inject, Injectable, Logger } from "@nestjs/common";
import { UserStatus } from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { STORAGE_PORT, StoragePort } from "../../infra/storage/storage.port";

/** PRIV-1: days between asking to delete an account and the purge. */
export const ACCOUNT_PURGE_AFTER_DAYS = 30;
const DELETED_NAME = "মুছে ফেলা অ্যাকাউন্ট";

/**
 * PRIV-1 / DB-2: removes a deleted account's personal data after the grace
 * period. Documents and the profile photo are deleted from storage first,
 * then phone, e-mail, passwords, name, bio, coordinates, birth year, gender
 * and devices are cleared, which frees the phone number. Work records
 * (jobs, assignments, payments, reviews) stay for the other people involved
 * and for disputes, without a name. The account itself is never deleted (20
 * foreign keys restrict that).
 */
@Injectable()
export class AccountPurgeService {
  private readonly logger = new Logger(AccountPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async purgeDue(limit = 50) {
    const now = this.clock.now();
    const cutoff = new Date(
      now.getTime() - ACCOUNT_PURGE_AFTER_DAYS * 86_400_000,
    );
    const due = await this.prisma.user.findMany({
      where: {
        status: UserStatus.PENDING_DELETION,
        deleted_at: { lte: cutoff },
        purged_at: null,
      },
      select: { id: true, profile: { select: { photo_key: true } } },
      orderBy: { deleted_at: "asc" },
      take: limit,
    });
    let purged = 0;
    for (const user of due) {
      try {
        await this.purge(user.id, user.profile?.photo_key ?? null, now);
        purged += 1;
      } catch (error) {
        // Storage failed: nothing in the database changed for this account;
        // the next run tries again.
        this.logger.error(
          `Account purge failed for ${user.id}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }
    return { purged };
  }

  private async purge(userId: string, photoKey: string | null, now: Date) {
    const documents = await this.prisma.document.findMany({
      where: { user_id: userId, deleted_at: null },
      select: { id: true, storage_key: true },
    });
    for (const document of documents)
      await this.storage.deleteObject(document.storage_key);
    if (photoKey) await this.storage.deleteObject(photoKey);
    await this.prisma.$transaction([
      this.prisma.document.updateMany({
        where: { id: { in: documents.map((document) => document.id) } },
        data: { deleted_at: now },
      }),
      // Refresh tokens go with their devices (ON DELETE CASCADE).
      this.prisma.userDevice.deleteMany({ where: { user_id: userId } }),
      this.prisma.refreshToken.deleteMany({ where: { user_id: userId } }),
      this.prisma.profile.updateMany({
        where: { user_id: userId },
        data: {
          display_name: DELETED_NAME,
          photo_key: null,
          bio: null,
          gender: null,
          birth_year: null,
          lat: null,
          lng: null,
          primary_location_id: null,
          mentor_bio: null,
          deleted_at: now,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          phone_e164: null,
          email: null,
          password_hash: null,
          mobile_password_hash: null,
          purged_at: now,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          action: "ACCOUNT_PURGED",
          entity: "USER",
          entity_id: userId,
          before_json: { documents: documents.length, photo: !!photoKey },
          after_json: { purgedAt: now.toISOString() },
        },
      }),
    ]);
  }
}
