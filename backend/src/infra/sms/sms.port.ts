export const SMS_PORT = Symbol("SMS_PORT");

export interface SmsOtp {
  challengeId: string;
  code: string;
  expiresInSeconds: number;
  phoneE164: string;
}

export interface SmsPort {
  sendOtp(message: SmsOtp): Promise<void>;
}
