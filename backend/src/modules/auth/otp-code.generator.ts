import { Injectable } from "@nestjs/common";
import { randomInt } from "node:crypto";

export const OTP_CODE_GENERATOR = Symbol("OTP_CODE_GENERATOR");

export interface OtpCodeGenerator {
  generate(): string;
}

@Injectable()
export class CryptoOtpCodeGenerator implements OtpCodeGenerator {
  generate(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }
}
