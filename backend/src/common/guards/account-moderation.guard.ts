import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ModerationLevel, UserStatus } from "@prisma/client";

import { CLOCK, Clock } from "../time/clock";
import {
  ACCOUNT_MODERATION_READER,
  AccountModerationReader,
} from "./account-moderation.reader";
import { AuthenticatedRequest } from "./jwt.guard";

const SAFETY_WRITE_PATHS = [
  /\/reports(?:\/|$)/u,
  /\/users\/[0-9a-f-]+\/block$/u,
  /\/verification-requests(?:\/|$)/u,
  /\/uploads(?:\/|$)/u,
  /\/auth\/(?:session|logout|logout-all)$/u,
];

@Injectable()
export class AccountModerationGuard implements CanActivate {
  constructor(
    @Inject(ACCOUNT_MODERATION_READER)
    private readonly accounts: AccountModerationReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) return true;
    const user = await this.accounts.findAccount(request.auth.sub);
    if (!user || user.deleted_at || user.status === UserStatus.BANNED) {
      throw new ForbiddenException("This account is unavailable.");
    }
    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.PENDING_DELETION
    ) {
      throw new ForbiddenException("This account is suspended.");
    }

    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (!mutation) return true;
    const path = request.path || request.originalUrl.split("?")[0]!;
    const safetyWrite = SAFETY_WRITE_PATHS.some((pattern) =>
      pattern.test(path),
    );
    if (user.reverification_required && !safetyWrite) {
      throw new ForbiddenException(
        "Identity re-verification is required before marketplace actions.",
      );
    }
    const activeRestriction =
      user.moderation_level === ModerationLevel.RESTRICT &&
      (!user.restriction_ends_at ||
        user.restriction_ends_at > this.clock.now());
    if (activeRestriction && !safetyWrite) {
      throw new ForbiddenException(
        "Marketplace actions are temporarily restricted.",
      );
    }
    return true;
  }
}
