import { Injectable } from "@nestjs/common";

import { SmsOtp, SmsPort } from "./sms.port";

@Injectable()
export class DisabledSmsAdapter implements SmsPort {
  async sendOtp(_message: SmsOtp): Promise<void> {
    throw new Error("SMS delivery is not configured");
  }
}
