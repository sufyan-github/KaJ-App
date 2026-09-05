import { createHmac, randomBytes } from "node:crypto";

import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type BdappsGatewayResponse = Record<string, unknown> & {
  referenceNo?: unknown;
  status?: unknown;
  statusCode?: unknown;
  subscriptionStatus?: unknown;
  subscriberId?: unknown;
};

@Injectable()
export class BdappsGatewayClient {
  private readonly baseUrl: string;
  private readonly internalKey: string;

  constructor(config: ConfigService) {
    this.baseUrl = config
      .get<string>("BDAPPS_GATEWAY_URL", "")
      .replace(/\/+$/u, "");
    this.internalKey = config.get<string>("BDAPPS_INTERNAL_API_KEY", "");
  }

  async post(
    endpoint: "otp_request.php" | "otp_verify.php" | "status.php",
    payload: Record<string, string>,
  ): Promise<BdappsGatewayResponse> {
    if (!this.baseUrl || this.internalKey.length < 32) {
      throw this.unavailable();
    }

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const nonce = randomBytes(16).toString("hex");
    const signature = createHmac("sha256", this.internalKey)
      .update(body + timestamp + nonce)
      .digest("hex");

    try {
      const response = await fetch(`${this.baseUrl}/${endpoint}`, {
        body,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.internalKey,
          "X-Nonce": nonce,
          "X-Signature": signature,
          "X-Timestamp": timestamp,
        },
        method: "POST",
        signal: AbortSignal.timeout(16_000),
      });
      const parsed: unknown = await response.json();
      if (
        !response.ok ||
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw this.unavailable();
      }
      return parsed as BdappsGatewayResponse;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw this.unavailable();
    }
  }

  private unavailable() {
    return new ServiceUnavailableException(
      "The mobile operator service is temporarily unavailable.",
    );
  }
}
