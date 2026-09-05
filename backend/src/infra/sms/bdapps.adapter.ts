import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { BdappsGatewayClient } from "../bdapps/bdapps-gateway.client";
import {
  fromBdappsSubscriberId,
  toBdappsSubscriberId,
} from "../bdapps/bdapps-subscriber";
import { RedisService } from "../redis/redis.service";
import { SmsOtp, SmsPort } from "./sms.port";

interface StoredChallenge {
  phoneE164: string;
  referenceNo: string;
}

@Injectable()
export class BdappsSmsAdapter implements SmsPort {
  constructor(
    private readonly gateway: BdappsGatewayClient,
    private readonly redis: RedisService,
  ) {}

  async sendOtp(message: SmsOtp): Promise<void> {
    const response = await this.gateway.post("otp_request.php", {
      subscriberId: toBdappsSubscriberId(message.phoneE164),
    });
    if (
      response.statusCode !== "S1000" ||
      typeof response.referenceNo !== "string" ||
      response.referenceNo.length === 0
    ) {
      throw new ServiceUnavailableException(
        "The operator could not send a verification code right now.",
      );
    }

    const stored: StoredChallenge = {
      phoneE164: message.phoneE164,
      referenceNo: response.referenceNo,
    };
    await this.redis
      .getClient()
      .set(
        this.challengeKey(message.challengeId),
        JSON.stringify(stored),
        "EX",
        message.expiresInSeconds,
      );
  }

  async verifyOtp(input: {
    challengeId: string;
    code: string;
    phoneE164: string;
  }): Promise<{ valid: boolean }> {
    const key = this.challengeKey(input.challengeId);
    const serialized = await this.redis.getClient().get(key);
    if (!serialized) return { valid: false };

    const stored = this.readStoredChallenge(serialized);
    if (!stored || stored.phoneE164 !== input.phoneE164) {
      await this.redis.getClient().del(key);
      return { valid: false };
    }

    const response = await this.gateway.post("otp_verify.php", {
      otp: input.code,
      referenceNo: stored.referenceNo,
    });
    if (response.statusCode === "E1357") return { valid: false };
    if (
      response.statusCode !== "S1000" ||
      typeof response.subscriberId !== "string"
    ) {
      throw new ServiceUnavailableException(
        "The operator could not verify the code right now.",
      );
    }

    const verifiedPhone = fromBdappsSubscriberId(response.subscriberId);
    if (verifiedPhone !== input.phoneE164) {
      throw new ServiceUnavailableException(
        "The operator returned an invalid verification response.",
      );
    }
    await this.redis.getClient().del(key);
    return { valid: true };
  }

  private challengeKey(challengeId: string): string {
    return `kaj:auth:bdapps:${challengeId}`;
  }

  private readStoredChallenge(value: string): StoredChallenge | null {
    try {
      const parsed = JSON.parse(value) as Partial<StoredChallenge>;
      return typeof parsed.phoneE164 === "string" &&
        typeof parsed.referenceNo === "string"
        ? { phoneE164: parsed.phoneE164, referenceNo: parsed.referenceNo }
        : null;
    } catch {
      return null;
    }
  }
}
