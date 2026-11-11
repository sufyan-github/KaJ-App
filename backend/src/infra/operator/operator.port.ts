import { CarrierSubscriptionStatus } from "../bdapps/bdapps-status";

export const OPERATOR_PORT = Symbol("OPERATOR_PORT");

export type OperatorEligibilityStatus =
  "PENDING" | "VERIFIED" | "REJECTED" | "UNSUPPORTED";

export interface OperatorEligibilityResult {
  operatorCode: string;
  providerReference: string | null;
  status: OperatorEligibilityStatus;
  /** Normalized live carrier state when the adapter manages remote billing. */
  carrierStatus?: CarrierSubscriptionStatus;
}

export interface OperatorPort {
  readonly managesRemoteBilling?: boolean;
  checkEligibility(input: {
    operatorCode: string;
    phoneE164: string;
    /** Stored carrier subscriber id (may be masked); falls back to the number. */
    subscriberId?: string | null;
  }): Promise<OperatorEligibilityResult>;
  /**
   * Stops carrier billing. Resolves when the carrier confirms the subscriber is
   * unregistered (including "already unregistered"); rejects otherwise.
   */
  cancelSubscription?(input: {
    phoneE164: string;
    subscriberId?: string | null;
  }): Promise<{ carrierStatus: "UNREGISTERED" }>;
}
