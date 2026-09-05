import { createHmac, timingSafeEqual } from "node:crypto";
import { IncomingHttpHeaders } from "node:http";

import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { RedisService } from "../redis/redis.service";

@Injectable()
export class BdappsWebhookVerifier {
  private readonly internalKey: string;

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.internalKey = config.get<string>("BDAPPS_INTERNAL_API_KEY", "");
  }

  async verify(headers: IncomingHttpHeaders, rawBody?: Buffer): Promise<void> {
    if (this.internalKey.length < 32) {
      throw new ServiceUnavailableException(
        "The operator webhook is not configured.",
      );
    }
    const apiKey = this.header(headers, "x-api-key");
    const timestamp = this.header(headers, "x-timestamp");
    const nonce = this.header(headers, "x-nonce");
    const signature = this.header(headers, "x-signature");
    if (
      !rawBody ||
      !timestamp ||
      !/^[a-f\d]{32}$/iu.test(nonce) ||
      !/^[a-f\d]{64}$/iu.test(signature) ||
      !/^\d{10,13}$/u.test(timestamp)
    ) {
      throw new UnauthorizedException("Invalid operator webhook signature.");
    }
    if (!this.safeEqual(apiKey, this.internalKey)) {
      throw new UnauthorizedException("Invalid operator webhook signature.");
    }
    const timestampSeconds = Number(timestamp);
    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(Math.floor(Date.now() / 1_000) - timestampSeconds) > 300
    ) {
      throw new UnauthorizedException("Expired operator webhook signature.");
    }
    const expected = createHmac("sha256", this.internalKey)
      .update(Buffer.concat([rawBody, Buffer.from(timestamp + nonce)]))
      .digest("hex");
    if (!this.safeEqual(signature.toLowerCase(), expected)) {
      throw new UnauthorizedException("Invalid operator webhook signature.");
    }
    const claimed = await this.redis
      .getClient()
      .set(
        `kaj:bdapps:webhook:nonce:${nonce.toLowerCase()}`,
        "1",
        "EX",
        600,
        "NX",
      );
    if (claimed !== "OK") {
      throw new UnauthorizedException("Operator webhook was already received.");
    }
  }

  private header(headers: IncomingHttpHeaders, name: string): string {
    const value = headers[name];
    return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
