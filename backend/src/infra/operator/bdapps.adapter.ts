import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { BdappsGatewayClient } from "../bdapps/bdapps-gateway.client";
import { toBdappsSubscriberId } from "../bdapps/bdapps-subscriber";
import { OperatorEligibilityResult, OperatorPort } from "./operator.port";

const operatorPrefixes: Readonly<Record<string, string>> = {
  AIRTEL: "+88016",
  ROBI: "+88018",
};

@Injectable()
export class BdappsOperatorAdapter implements OperatorPort {
  readonly managesRemoteBilling = true;

  constructor(private readonly gateway: BdappsGatewayClient) {}

  async checkEligibility(input: {
    operatorCode: string;
    phoneE164: string;
  }): Promise<OperatorEligibilityResult> {
    const prefix = operatorPrefixes[input.operatorCode];
    if (!prefix) {
      return { ...input, providerReference: null, status: "UNSUPPORTED" };
    }
    if (!input.phoneE164.startsWith(prefix)) {
      return { ...input, providerReference: null, status: "REJECTED" };
    }

    const response = await this.gateway.post("status.php", {
      subscriberId: toBdappsSubscriberId(input.phoneE164),
    });
    if (response.statusCode !== "S1000") {
      throw new ServiceUnavailableException(
        "The operator could not confirm subscription status right now.",
      );
    }
    const status = String(
      response.subscriptionStatus ?? response.status ?? "",
    ).toUpperCase();
    const inactiveStatuses = new Set([
      "CANCELLED",
      "EXPIRED",
      "UNREGISTERED",
      "UNSUBSCRIBED",
    ]);
    if (status !== "REGISTERED" && !inactiveStatuses.has(status)) {
      throw new ServiceUnavailableException(
        "The operator returned an unrecognized subscription status.",
      );
    }
    const providerReference =
      typeof response.referenceNo === "string" ? response.referenceNo : null;
    return {
      operatorCode: input.operatorCode,
      providerReference,
      status: status === "REGISTERED" ? "VERIFIED" : "PENDING",
    };
  }
}
