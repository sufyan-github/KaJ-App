import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuthenticatedRequest } from "../../common/guards/jwt.guard";
import { SUBSCRIPTION_FEATURE_KEY } from "./subscription-feature";
import { SubscriptionsService } from "./subscriptions.service";

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<string>(
      SUBSCRIPTION_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!featureKey) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) return true;
    const access = await this.subscriptions.accessFor(
      request.auth.sub,
      featureKey,
    );
    if (access.allowed) return true;
    throw new ForbiddenException({
      code: "SUBSCRIPTION_REQUIRED",
      field: "subscription",
      message:
        "Your subscription is inactive or expired. Renew it to continue using this feature.",
      messageKey: "error.subscription.required",
    });
  }
}
