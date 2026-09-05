export const OPERATOR_PORT = Symbol("OPERATOR_PORT");

export type OperatorEligibilityStatus =
  "PENDING" | "VERIFIED" | "REJECTED" | "UNSUPPORTED";

export interface OperatorEligibilityResult {
  operatorCode: string;
  providerReference: string | null;
  status: OperatorEligibilityStatus;
}

export interface OperatorPort {
  readonly managesRemoteBilling?: boolean;
  checkEligibility(input: {
    operatorCode: string;
    phoneE164: string;
  }): Promise<OperatorEligibilityResult>;
}
