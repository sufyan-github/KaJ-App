import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import {
  CaptureInput,
  CreateChargeInput,
  PaymentOperationResult,
  PaymentPort,
  RefundInput,
  VerifiedPaymentWebhook,
  WebhookInput,
} from "./payment.port";

@Injectable()
export class ManualPaymentAdapter implements PaymentPort {
  async createCharge(
    _input: CreateChargeInput,
  ): Promise<PaymentOperationResult> {
    return {
      providerReference: `manual:${randomUUID()}`,
      status: "PENDING",
    };
  }

  async capture(_input: CaptureInput): Promise<PaymentOperationResult> {
    throw new Error("Manual payment capture is not supported");
  }

  async refund(_input: RefundInput): Promise<PaymentOperationResult> {
    throw new Error("Manual payment refunds are not supported");
  }

  async verifyWebhook(_input: WebhookInput): Promise<VerifiedPaymentWebhook> {
    return { valid: false };
  }

  async getStatus(providerReference: string): Promise<PaymentOperationResult> {
    return { providerReference, status: "PENDING" };
  }
}
