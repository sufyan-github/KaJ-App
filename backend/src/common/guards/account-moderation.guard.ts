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

// Writes still allowed for restricted or re-verifying accounts: safety
// reports, blocks, verification, and the ways out (cancel a paid
// subscription, delete the account, dispute or report).
const SAFETY_WRITE_PATHS = [
  /\/reports(?:\/|$)/u,
  /\/conversations\/[0-9a-f-]+\/report$/u,
  /\/assignments\/[0-9a-f-]+\/disputes$/u,
  /\/disputes\/[0-9a-f-]+\/(?:evidence|appeal)$/u,
  /\/subscriptions\/cancel$/u,
  /\/api\/v1\/me$/u,
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
    if (denial) throw new ForbiddenException({ ...denial });
    return true;
  }
}

/** A stable, client-mappable reason an account may not act. */
export interface AccountDenial {
  code:
    | "ACCOUNT_UNAVAILABLE"
    | "ACCOUNT_SUSPENDED"
    | "REVERIFICATION_REQUIRED"
    | "ACCOUNT_RESTRICTED";
  message: string;
  messageKey: string;
}

const DENIALS = {
  unavailable: {
    code: "ACCOUNT_UNAVAILABLE",
    message: "This account is unavailable.",
    messageKey: "error.account.unavailable",
  },
  suspended: {
    code: "ACCOUNT_SUSPENDED",
    message: "This account is suspended.",
    messageKey: "error.account.suspended",
  },
  reverification: {
    code: "REVERIFICATION_REQUIRED",
    message: "Identity re-verification is required before marketplace actions.",
    messageKey: "error.account.reverification_required",
  },
  restricted: {
    code: "ACCOUNT_RESTRICTED",
    message: "Marketplace actions are temporarily restricted.",
    messageKey: "error.account.restricted",
  },
} as const satisfies Record<string, AccountDenial>;

/**
 * The account rules shared by HTTP (this guard) and the chat gateway, which
 * Nest does not run global guards for. Returns the denial (code, English
 * message, i18n key), or null when the action is allowed.
 */
export function accountActionDenial(
  user: AccountModerationState | null,
  now: Date,
  action: { mutation: boolean; safetyWrite: boolean },
): AccountDenial | null {
  if (!user || user.deleted_at || user.status === UserStatus.BANNED)
    return DENIALS.unavailable;
  if (
    user.status === UserStatus.SUSPENDED ||
    user.status === UserStatus.PENDING_DELETION
  )
    return DENIALS.suspended;
  if (!action.mutation || action.safetyWrite) return null;
  if (user.reverification_required) return DENIALS.reverification;
  const activeRestriction =
    user.moderation_level === ModerationLevel.RESTRICT &&
    (!user.restriction_ends_at || user.restriction_ends_at > now);
  if (activeRestriction) return DENIALS.restricted;
  return null;
}
