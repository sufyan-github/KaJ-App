export const SMS_PORT = Symbol("SMS_PORT");

export interface SmsOtp {
  challengeId: string;
  code: string;
  expiresInSeconds: number;
  phoneE164: string;
}

export interface SmsPort {
  sendOtp(message: SmsOtp): Promise<void>;
  verifyOtp?(input: {
    challengeId: string;
    code: string;
    phoneE164: string;
  }): Promise<{ valid: boolean }>;
}
