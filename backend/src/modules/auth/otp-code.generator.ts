import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomInt } from "node:crypto";

export const OTP_CODE_GENERATOR = Symbol("OTP_CODE_GENERATOR");

export interface OtpCodeGenerator {
  generate(): string;
}

@Injectable()
export class CryptoOtpCodeGenerator implements OtpCodeGenerator {
  constructor(private readonly config?: ConfigService) {}

  generate(): string {
    const fixedCode = this.config?.get<string>("OTP_FIXED_CODE", "") ?? "";
    if (fixedCode !== "") return fixedCode;
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }
}
