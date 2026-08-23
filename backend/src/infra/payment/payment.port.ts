export const PAYMENT_PORT = Symbol("PAYMENT_PORT");

export type ProviderPaymentStatus =
  | "PENDING"
  | "REQUIRES_ACTION"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "REFUNDED";

export interface CreateChargeInput {
  amountPoisha: number;
  assignmentId: string;
  currency: "BDT";
  idempotencyKey: string;
  payerId: string;
}

export interface CaptureInput {
  amountPoisha: number;
  providerReference: string;
}

export interface RefundInput extends CaptureInput {
  reason: string;
}

export interface PaymentOperationResult {
  providerReference: string;
  status: ProviderPaymentStatus;
}

export interface WebhookInput {
  body: Buffer;
  headers: Readonly<Record<string, string | string[] | undefined>>;
}

export interface VerifiedPaymentWebhook {
  eventId?: string;
  providerReference?: string;
  status?: ProviderPaymentStatus;
  valid: boolean;
}

export interface PaymentPort {
  capture(input: CaptureInput): Promise<PaymentOperationResult>;
  createCharge(input: CreateChargeInput): Promise<PaymentOperationResult>;
  getStatus(providerReference: string): Promise<PaymentOperationResult>;
  refund(input: RefundInput): Promise<PaymentOperationResult>;
  verifyWebhook(input: WebhookInput): Promise<VerifiedPaymentWebhook>;
}
