import { Injectable } from "@nestjs/common";

import { SmsOtp, SmsPort } from "./sms.port";

function maskPhone(phoneE164: string): string {
  return `${phoneE164.slice(0, 4)}******${phoneE164.slice(-2)}`;
}

@Injectable()
export class ConsoleSmsAdapter implements SmsPort {
  async sendOtp(message: SmsOtp): Promise<void> {
    // The acceptance contract forbids OTPs in logs. Keep the development event useful but masked.
    process.stdout.write(
      `${JSON.stringify({
        challengeId: message.challengeId,
        code: "******",
        event: "development_sms_queued",
        expiresInSeconds: message.expiresInSeconds,
        phone: maskPhone(message.phoneE164),
      })}\n`,
    );
  }
}
