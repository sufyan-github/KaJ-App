import { Injectable } from "@nestjs/common";
import { ModerationLevel, UserStatus } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

export const ACCOUNT_MODERATION_READER = Symbol("ACCOUNT_MODERATION_READER");

export interface AccountModerationState {
  deleted_at: Date | null;
  moderation_level: ModerationLevel;
  restriction_ends_at: Date | null;
  reverification_required: boolean;
  status: UserStatus;
}

export interface AccountModerationReader {
  findAccount(userId: string): Promise<AccountModerationState | null>;
}

@Injectable()
export class PrismaAccountModerationReader implements AccountModerationReader {
  constructor(private readonly prisma: PrismaService) {}

  findAccount(userId: string): Promise<AccountModerationState | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        moderation_level: true,
        restriction_ends_at: true,
        reverification_required: true,
        deleted_at: true,
      },
    });
  }
}
