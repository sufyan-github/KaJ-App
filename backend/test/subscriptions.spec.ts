import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CreateSubscriptionPlanDto,
  RequestSubscriptionDto,
  UpdateSubscriptionDto,
} from "../src/modules/subscriptions/dto/subscriptions.dto";
import { SubscriptionsService } from "../src/modules/subscriptions/subscriptions.service";

describe("subscription and operator Version 1", () => {
  const planId = "6b491514-769f-4b22-873d-4effbf888b4c";

  it("accepts a provider-neutral pending request", async () => {
    const input = plainToInstance(RequestSubscriptionDto, {
      planId,
      operatorCode: "ROBI",
    });

    await expect(validate(input)).resolves.toHaveLength(0);
  });

  it("rejects arbitrary provider identifiers", async () => {
    const input = plainToInstance(RequestSubscriptionDto, {
      planId,
      operatorCode: "robi<script>",
    });

    expect(await validate(input)).not.toHaveLength(0);
  });

  it("requires an audit reason for plan and status changes", async () => {
    const plan = plainToInstance(CreateSubscriptionPlanDto, {
      code: "LOCAL_MONTHLY",
      nameEn: "Local monthly",
      nameBn: "স্থানীয় মাসিক",
      pricePoisha: "10000",
      durationDays: 30,
      featureKeys: ["JOB_APPLICATION"],
      isActive: false,
      sortOrder: 0,
      reason: "short",
    });
    const status = plainToInstance(UpdateSubscriptionDto, {
      status: "ACTIVE",
      reason: "short",
    });

    expect((await validate(plan)).map((item) => item.property)).toContain(
      "reason",
    );
    expect((await validate(status)).map((item) => item.property)).toContain(
      "reason",
    );
  });

  it("keeps subscription billing separate from job cash payments", () => {
    const migration = readFileSync(
      join(
        __dirname,
        "..",
        "prisma",
        "migrations",
        "20260905143000_subscriptions_cash_payments",
        "migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain('CREATE TABLE "subscription_payments"');
    expect(migration).toContain("ADD VALUE 'CASH_RECORDED'");
    expect(migration).toContain("ADD VALUE 'DISPUTED'");
    expect(migration).toContain("'ROBI'");
    expect(migration).toContain("'AIRTEL'");
    expect(migration).not.toMatch(/INSERT INTO "subscription_plans"/u);
  });

  it("cannot activate without an existing confirmed payment record", async () => {
    const service = new SubscriptionsService(
      {
        subscription: {
          findUnique: jest.fn().mockResolvedValue({
            id: planId,
            status: "PENDING",
            payments: [],
            plan: { duration_days: 30 },
            user: {
              operator_identity: {
                operator_id: planId,
                status: "VERIFIED",
              },
            },
          }),
        },
      } as never,
      { checkEligibility: jest.fn() } as never,
    );

    await expect(
      service.updateSubscription(
        planId,
        {
          status: "ACTIVE",
          paymentStatus: "PAID",
          reason: "Externally confirmed",
        } as UpdateSubscriptionDto,
        {} as never,
        {} as never,
      ),
    ).rejects.toThrow("Confirmed payment is required");
  });

  it("rejects unknown access-rule paths before touching storage", async () => {
    const service = new SubscriptionsService({} as never, {} as never);

    await expect(
      service.updateAccessRule(
        "ARBITRARY_FEATURE",
        {
          isActive: true,
          requiresActiveSubscription: true,
          reason: "Reject arbitrary feature",
        },
        {} as never,
        {} as never,
      ),
    ).rejects.toThrow("Unknown subscription feature");
  });
});
