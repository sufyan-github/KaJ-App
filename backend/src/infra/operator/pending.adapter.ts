import { Injectable } from "@nestjs/common";

import { OperatorEligibilityResult, OperatorPort } from "./operator.port";

/**
 * Safe Version 1 adapter. It never treats a number prefix as verified operator
 * eligibility and never creates a charge. A BDApps/Robi/Airtel adapter can
 * replace this provider without changing authentication or subscriptions.
 */
@Injectable()
export class PendingOperatorAdapter implements OperatorPort {
  readonly managesRemoteBilling = false;

  async checkEligibility(input: {
    operatorCode: string;
    phoneE164: string;
  }): Promise<OperatorEligibilityResult> {
    void input.phoneE164;
    return {
      operatorCode: input.operatorCode,
      providerReference: null,
      status: "PENDING",
    };
  }
}
