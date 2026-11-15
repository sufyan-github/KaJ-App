import { ForbiddenException, Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/prisma/prisma.service";

/**
 * The one place that decides whether two people are kept apart by a block.
 * A block works both ways: neither side can find, contact, hire or book the
 * other, whoever created it. Callers never learn who blocked whom.
 */
@Injectable()
export class UserBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  /** True when either user has blocked the other. */
  async between(firstUserId: string, secondUserId: string): Promise<boolean> {
    if (firstUserId === secondUserId) return false;
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blocker_user_id: firstUserId, blocked_user_id: secondUserId },
          { blocker_user_id: secondUserId, blocked_user_id: firstUserId },
        ],
      },
      select: { blocker_user_id: true },
    });
    return block !== null;
  }

  /** Everyone this user has blocked or been blocked by. */
  async hiddenFrom(userId: string): Promise<string[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: {
        OR: [{ blocker_user_id: userId }, { blocked_user_id: userId }],
      },
      select: { blocker_user_id: true, blocked_user_id: true },
    });
    return [
      ...new Set(
        rows.map((row) =>
          row.blocker_user_id === userId
            ? row.blocked_user_id
            : row.blocker_user_id,
        ),
      ),
    ];
  }

  /** Throws 403 USER_BLOCKED when the two users are kept apart. */
  async assertNotBlocked(
    firstUserId: string,
    secondUserId: string,
  ): Promise<void> {
    if (await this.between(firstUserId, secondUserId))
      throw new ForbiddenException(USER_BLOCKED);
  }
}

/** Deliberately does not say who blocked whom. */
export const USER_BLOCKED = {
  code: "USER_BLOCKED",
  message: "You can't interact with this person.",
  messageKey: "error.safety.blocked",
} as const;
