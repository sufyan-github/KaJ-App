import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { RoleMode } from "@prisma/client";
import { PaymentsService } from "./payments.service";

@ApiTags("payments")
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("payments/capabilities")
  @Policy(Policies.authenticated())
  capabilities() {
    return this.payments.capabilities();
  }

  @Get("payments/history")
  @Policy(Policies.authenticated())
  history(@CurrentUser() claims: AccessTokenClaims) {
    return this.payments.history(claims.sub);
  }

  @Get("assignments/:id/payment")
  @Policy(Policies.authenticated())
  assignmentPayment(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) assignmentId: string,
  ) {
    return this.payments.forAssignment(claims.sub, assignmentId);
  }

  @Post("assignments/:id/payment/cash-paid")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  markCashPaid(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) assignmentId: string,
  ) {
    return this.payments.markCashPaid(claims.sub, assignmentId);
  }

  @Post("assignments/:id/payment-intent")
  @Policy(Policies.authenticated())
  paymentIntent(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) assignmentId: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const key = idempotencyKey?.trim();
    if (!key || key.length < 8 || key.length > 128)
      throw new BadRequestException(
        "Idempotency-Key must contain between 8 and 128 characters.",
      );
    return this.payments.createIntent(claims.sub, assignmentId, key);
  }
}
