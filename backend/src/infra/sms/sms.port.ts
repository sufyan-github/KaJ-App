export const SMS_PORT = Symbol("SMS_PORT");

export interface SmsOtp {
  challengeId: string;
  code: string;
  expiresInSeconds: number;
  phoneE164: string;
}

/** Carrier confirmation returned when a carrier OTP (BDApps) was verified. */
export interface CarrierVerification {
  /** Carrier-issued subscriber id (may be masked); null when not returned. */
  subscriberId: string | null;
  subscriptionStatus: string;
}

export type SmsVerificationFailure =
  "invalid" | "expired" | "attempts_exceeded";

export interface SmsVerificationResult {
  valid: boolean;
  /** Why a code was rejected; absent means an ordinary invalid code. */
  failure?: SmsVerificationFailure;
  carrier?: CarrierVerification;
}

export interface SmsPort {
  sendOtp(message: SmsOtp): Promise<void>;
  verifyOtp?(input: {
    challengeId: string;
    code: string;
    phoneE164: string;
  }): Promise<SmsVerificationResult>;
}
