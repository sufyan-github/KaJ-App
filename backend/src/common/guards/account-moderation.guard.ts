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
  AccountModerationState,
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
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const path = request.path || request.originalUrl.split("?")[0]!;
    const denial = accountActionDenial(user, this.clock.now(), {
      mutation,
      safetyWrite: SAFETY_WRITE_PATHS.some((pattern) => pattern.test(path)),
    });
    if (denial) throw new ForbiddenException(denial);
    return true;
  }
}

/**
 * The account rules shared by HTTP (this guard) and the chat gateway, which
 * Nest does not run global guards for. Returns the denial message, or null
 * when the action is allowed.
 */
export function accountActionDenial(
  user: AccountModerationState | null,
  now: Date,
  action: { mutation: boolean; safetyWrite: boolean },
): string | null {
  if (!user || user.deleted_at || user.status === UserStatus.BANNED)
    return "This account is unavailable.";
  if (
    user.status === UserStatus.SUSPENDED ||
    user.status === UserStatus.PENDING_DELETION
  )
    return "This account is suspended.";
  if (!action.mutation || action.safetyWrite) return null;
  if (user.reverification_required)
    return "Identity re-verification is required before marketplace actions.";
  const activeRestriction =
    user.moderation_level === ModerationLevel.RESTRICT &&
    (!user.restriction_ends_at || user.restriction_ends_at > now);
  if (activeRestriction)
    return "Marketplace actions are temporarily restricted.";
  return null;
}
