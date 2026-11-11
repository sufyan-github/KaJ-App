import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { BdappsGatewayClient } from "../bdapps/bdapps-gateway.client";
import { normalizeCarrierStatus } from "../bdapps/bdapps-status";
import { subscriberIdFor } from "../bdapps/bdapps-subscriber";
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
    subscriberId?: string | null;
  }): Promise<OperatorEligibilityResult> {
    const prefix = operatorPrefixes[input.operatorCode];
    const base = { operatorCode: input.operatorCode, providerReference: null };
    if (!prefix) return { ...base, status: "UNSUPPORTED" };
    if (!input.phoneE164.startsWith(prefix)) {
      return { ...base, status: "REJECTED" };
    }

    const response = await this.gateway.post("status.php", {
      subscriberId: subscriberIdFor(input.phoneE164, input.subscriberId),
    });
    if (response.statusCode !== "S1000") {
      throw new ServiceUnavailableException(
        "The operator could not confirm subscription status right now.",
      );
    }
    const carrierStatus = normalizeCarrierStatus(
      response.subscriptionStatus ?? response.status,
    );
    if (!carrierStatus) {
      throw new ServiceUnavailableException(
        "The operator returned an unrecognized subscription status.",
      );
    }
    return {
      ...base,
      carrierStatus,
      status: carrierStatus === "REGISTERED" ? "VERIFIED" : "PENDING",
    };
  }

  async cancelSubscription(input: {
    phoneE164: string;
    subscriberId?: string | null;
  }): Promise<{ carrierStatus: "UNREGISTERED" }> {
    const response = await this.gateway.post("unsubscribe.php", {
      subscriberId: subscriberIdFor(input.phoneE164, input.subscriberId),
    });
    // The gateway already maps E1356 (already unregistered) to S1000.
    if (
      (response.statusCode !== "S1000" && response.statusCode !== "E1356") ||
      (response.subscriptionStatus !== undefined &&
        normalizeCarrierStatus(response.subscriptionStatus) !== "UNREGISTERED")
    ) {
      throw new ServiceUnavailableException(
        "The operator could not stop the subscription right now.",
      );
    }
    return { carrierStatus: "UNREGISTERED" };
  }
}
