import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { compare, hash } from "bcryptjs";

import { RateLimitException } from "../../common/errors/rate-limit.exception";
import { BdappsGatewayClient } from "../bdapps/bdapps-gateway.client";
import {
  fromBdappsSubscriberId,
  isBdappsSubscriberId,
  subscriberIdFor,
  toBdappsSubscriberId,
} from "../bdapps/bdapps-subscriber";
import { operatorSmsUnavailableError } from "../bdapps/bdapps.errors";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { SmsOtp, SmsPort, SmsVerificationResult } from "./sms.port";

const FALLBACK_CODE_BCRYPT_ROUNDS = 10;

/**
 * `carrier`: BDApps sent its own subscription OTP (verify through BDApps).
 * `kaaj_sms`: the number is already subscribed (E1351), so BDApps sends no OTP;
 * KAAJ sends its own CSPRNG code through the BDApps SMS API and verifies it locally.
 */
type StoredChallenge =
  | { mode: "carrier"; phoneE164: string; referenceNo: string }
  | { mode: "kaaj_sms"; phoneE164: string; codeHash: string };

const invalidCodeStatuses = new Set(["E1850", "E1357"]);
const expiredCodeStatuses = new Set(["E1851", "E1854", "E1855"]);

@Injectable()
export class BdappsSmsAdapter implements SmsPort {
  private readonly logger = new Logger(BdappsSmsAdapter.name);

  constructor(
    private readonly gateway: BdappsGatewayClient,
    private readonly redis: RedisService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async sendOtp(message: SmsOtp): Promise<void> {
    const response = await this.gateway.post("otp_request.php", {
      subscriberId: toBdappsSubscriberId(message.phoneE164),
    });
    if (response.statusCode === "E1351") {
      await this.sendKaajCode(message);
      return;
    }
    if (response.statusCode === "E1853") {
      throw new RateLimitException(
        {
          action: null,
          code: "OTP_RATE_LIMITED",
          details: [],
          field: null,
          message: "Too many OTP requests. Try again later.",
          messageKey: "error.auth.otp_rate_limited",
          retryable: true,
        },
        3_600,
      );
    }
    if (
      response.statusCode !== "S1000" ||
      typeof response.referenceNo !== "string" ||
      response.referenceNo.length === 0
    ) {
      throw new ServiceUnavailableException(
        "The operator could not send a verification code right now.",
      );
    }

    await this.store(message, {
      mode: "carrier",
      phoneE164: message.phoneE164,
      referenceNo: response.referenceNo,
    });
  }

  async verifyOtp(input: {
    challengeId: string;
    code: string;
    phoneE164: string;
  }): Promise<SmsVerificationResult> {
    const key = this.challengeKey(input.challengeId);
    const serialized = await this.redis.getClient().get(key);
    if (!serialized) return { valid: false };

    const stored = this.readStoredChallenge(serialized);
    if (!stored || stored.phoneE164 !== input.phoneE164) {
      await this.redis.getClient().del(key);
      return { valid: false };
    }

    if (stored.mode === "kaaj_sms") {
      if (!(await compare(input.code, stored.codeHash))) {
        return { valid: false, failure: "invalid" };
      }
      await this.redis.getClient().del(key);
      // BDApps answered E1351 (already registered) when this code was requested.
      return {
        valid: true,
        carrier: { subscriberId: null, subscriptionStatus: "REGISTERED" },
      };
    }

    const response = await this.gateway.post("otp_verify.php", {
      otp: input.code,
      referenceNo: stored.referenceNo,
    });
    const statusCode = String(response.statusCode ?? "");
    if (invalidCodeStatuses.has(statusCode)) {
      return { valid: false, failure: "invalid" };
    }
    if (expiredCodeStatuses.has(statusCode)) {
      await this.redis.getClient().del(key);
      return { valid: false, failure: "expired" };
    }
    if (statusCode === "E1852") {
      await this.redis.getClient().del(key);
      return { valid: false, failure: "attempts_exceeded" };
    }
    if (
      statusCode !== "S1000" ||
      !isBdappsSubscriberId(response.subscriberId)
    ) {
      throw new ServiceUnavailableException(
        "The operator could not verify the code right now.",
      );
    }

    // A real (unmasked) id must belong to the same number; a masked id is opaque.
    const verifiedPhone = fromBdappsSubscriberId(response.subscriberId);
    if (verifiedPhone !== null && verifiedPhone !== input.phoneE164) {
      throw new ServiceUnavailableException(
        "The operator returned an invalid verification response.",
      );
    }
    await this.redis.getClient().del(key);
    return {
      valid: true,
      carrier: {
        subscriberId: response.subscriberId,
        subscriptionStatus:
          typeof response.subscriptionStatus === "string" &&
          response.subscriptionStatus !== ""
            ? response.subscriptionStatus
            : "REGISTERED",
      },
    };
  }

  private async sendKaajCode(message: SmsOtp): Promise<void> {
    const subscriberId = subscriberIdFor(
      message.phoneE164,
      await this.storedSubscriberId(message.phoneE164),
    );
    // Store first so a delivered code is always verifiable.
    await this.store(message, {
      mode: "kaaj_sms",
      phoneE164: message.phoneE164,
      codeHash: await hash(message.code, FALLBACK_CODE_BCRYPT_ROUNDS),
    });
    const minutes = Math.max(1, Math.ceil(message.expiresInSeconds / 60));
    let statusCode: unknown;
    try {
      const response = await this.gateway.post("sms_send.php", {
        message: `KAAJ verification code: ${message.code}. It expires in ${minutes} min. Do not share it with anyone.`,
        subscriberId,
      });
      statusCode = response.statusCode;
    } catch {
      statusCode = null;
    }
    if (statusCode !== "S1000") {
      await this.redis.getClient().del(this.challengeKey(message.challengeId));
      this.logger.warn({
        event: "bdapps_fallback_sms_failed",
        statusCode: typeof statusCode === "string" ? statusCode : null,
      });
      throw operatorSmsUnavailableError();
    }
  }

  private async storedSubscriberId(phoneE164: string): Promise<string | null> {
    if (!this.prisma) return null;
    try {
      const identity = await this.prisma.userOperatorIdentity.findFirst({
        where: { user: { phone_e164: phoneE164 } },
        select: { provider_subscriber_id: true },
      });
      return identity?.provider_subscriber_id ?? null;
    } catch {
      return null;
    }
  }

  private async store(message: SmsOtp, value: StoredChallenge): Promise<void> {
    await this.redis
      .getClient()
      .set(
        this.challengeKey(message.challengeId),
        JSON.stringify(value),
        "EX",
        message.expiresInSeconds,
      );
  }

  private challengeKey(challengeId: string): string {
    return `kaj:auth:bdapps:${challengeId}`;
  }

  private readStoredChallenge(value: string): StoredChallenge | null {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (typeof parsed.phoneE164 !== "string") return null;
      if (parsed.mode === "kaaj_sms") {
        return typeof parsed.codeHash === "string"
          ? {
              mode: "kaaj_sms",
              phoneE164: parsed.phoneE164,
              codeHash: parsed.codeHash,
            }
          : null;
      }
      // Challenges stored before the mode field existed are carrier challenges.
      return typeof parsed.referenceNo === "string"
        ? {
            mode: "carrier",
            phoneE164: parsed.phoneE164,
            referenceNo: parsed.referenceNo,
          }
        : null;
    } catch {
      return null;
    }
  }
}
