import { createHmac } from "node:crypto";

import { ConfigService } from "@nestjs/config";

import { BdappsGatewayClient } from "../src/infra/bdapps/bdapps-gateway.client";
import { normalizeCarrierStatus } from "../src/infra/bdapps/bdapps-status";
import {
  fromBdappsSubscriberId,
  isBdappsSubscriberId,
  subscriberIdFor,
  toBdappsSubscriberId,
} from "../src/infra/bdapps/bdapps-subscriber";
import { BdappsWebhookVerifier } from "../src/infra/bdapps/bdapps-webhook.verifier";
import { BdappsOperatorAdapter } from "../src/infra/operator/bdapps.adapter";
import { BdappsSmsAdapter } from "../src/infra/sms/bdapps.adapter";

const INTERNAL_KEY = "b".repeat(64);
const PHONE = "+8801812345678";
const SUBSCRIBER = "tel:8801812345678";
const MASKED = "tel:B%3C4ZyPUKdGq8w+/x=AbCdEf==";

function fakeRedis() {
  const values = new Map<string, string>();
  const client = {
    del: jest.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(
      async (key: string, value: string, ...args: Array<string | number>) => {
        if (args.includes("NX") && values.has(key)) return null;
        values.set(key, value);
        return "OK";
      },
    ),
  };
  return { getClient: () => client, values };
}

// ConfigService reads process.env before its own values, so an ambient (even
// empty) BDAPPS_* variable would override the configuration built here.
const AMBIENT_KEYS = ["BDAPPS_GATEWAY_URL", "BDAPPS_INTERNAL_API_KEY"] as const;
const ambient = new Map<string, string | undefined>();

describe("bdapps adapters", () => {
  beforeAll(() => {
    for (const key of AMBIENT_KEYS) {
      ambient.set(key, process.env[key]);
      delete process.env[key];
    }
  });
  afterAll(() => {
    for (const key of AMBIENT_KEYS) {
      const value = ambient.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it("converts only valid Bangladesh subscriber identifiers", () => {
    expect(toBdappsSubscriberId(PHONE)).toBe(SUBSCRIBER);
    expect(fromBdappsSubscriberId(SUBSCRIBER)).toBe(PHONE);
    expect(fromBdappsSubscriberId("tel:14155552671")).toBeNull();
    expect(() => toBdappsSubscriberId("+14155552671")).toThrow(
      "valid Bangladesh",
    );
  });

  it("accepts masked subscriber ids as opaque values and prefers the stored id", () => {
    expect(isBdappsSubscriberId(MASKED)).toBe(true);
    expect(isBdappsSubscriberId(SUBSCRIBER)).toBe(true);
    expect(isBdappsSubscriberId("tel:short")).toBe(false);
    expect(isBdappsSubscriberId("tel:<script>alert(1)</script>")).toBe(false);
    expect(isBdappsSubscriberId("8801812345678")).toBe(false);
    expect(fromBdappsSubscriberId(MASKED)).toBeNull();
    expect(subscriberIdFor(PHONE, MASKED)).toBe(MASKED);
    expect(subscriberIdFor(PHONE, null)).toBe(SUBSCRIBER);
    expect(subscriberIdFor(PHONE, "garbage")).toBe(SUBSCRIBER);
  });

  it.each([
    ["REGISTERED", "REGISTERED"],
    ["registered.", "REGISTERED"],
    ["UNREGISTERED", "UNREGISTERED"],
    ["UNSUBSCRIBED", "UNREGISTERED"],
    ["EXPIRED", "UNREGISTERED"],
    ["CANCELLED", "UNREGISTERED"],
    ["PENDING", "CHARGE_PENDING"],
    ["CHARGE", "CHARGE_PENDING"],
    ["PENDING CHARGE", "CHARGE_PENDING"],
    ["PENDING_CHARGE", "CHARGE_PENDING"],
    ["CHARGE_PENDING", "CHARGE_PENDING"],
    ["SOMETHING", null],
    [undefined, null],
  ])("normalizes carrier status %p to %p", (input, expected) => {
    expect(normalizeCarrierStatus(input)).toBe(expected);
  });

  it("signs the exact gateway request body without exposing credentials in it", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ statusCode: "S1000", referenceNo: "ref-1" }),
          { status: 200 },
        ),
      );
    const client = new BdappsGatewayClient(
      new ConfigService({
        BDAPPS_GATEWAY_URL: "https://gateway.example/api/",
        BDAPPS_INTERNAL_API_KEY: INTERNAL_KEY,
      }),
    );

    await expect(
      client.post("otp_request.php", { subscriberId: SUBSCRIBER }),
    ).resolves.toEqual({ statusCode: "S1000", referenceNo: "ref-1" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = String(init.body);
    expect(url).toBe("https://gateway.example/api/otp_request.php");
    expect(body).toBe(JSON.stringify({ subscriberId: SUBSCRIBER }));
    expect(body).not.toContain(INTERNAL_KEY);
    expect(headers["X-API-Key"]).toBeUndefined();
    expect(JSON.stringify(headers)).not.toContain(INTERNAL_KEY);
    expect(headers["X-Signature"]).toBe(
      createHmac("sha256", INTERNAL_KEY)
        .update(body + headers["X-Timestamp"] + headers["X-Nonce"])
        .digest("hex"),
    );
  });

  it("stores the provider reference server-side and verifies the same phone", async () => {
    const gateway = {
      post: jest
        .fn()
        .mockResolvedValueOnce({ statusCode: "S1000", referenceNo: "ref-1" })
        .mockResolvedValueOnce({
          statusCode: "S1000",
          subscriberId: SUBSCRIBER,
        }),
    };
    const redis = fakeRedis();
    const adapter = new BdappsSmsAdapter(gateway as never, redis as never);

    await adapter.sendOtp({
      challengeId: "challenge-1",
      code: "987654",
      expiresInSeconds: 300,
      phoneE164: PHONE,
    });
    expect(JSON.stringify([...redis.values])).not.toContain("987654");
    await expect(
      adapter.verifyOtp({
        challengeId: "challenge-1",
        code: "654321",
        phoneE164: PHONE,
      }),
    ).resolves.toEqual({
      valid: true,
      carrier: { subscriberId: SUBSCRIBER, subscriptionStatus: "REGISTERED" },
    });
    expect(redis.values.size).toBe(0);
  });

  it("accepts a masked subscriber id from verification and returns it", async () => {
    const gateway = {
      post: jest
        .fn()
        .mockResolvedValueOnce({ statusCode: "S1000", referenceNo: "ref-1" })
        .mockResolvedValueOnce({
          statusCode: "S1000",
          subscriberId: MASKED,
          subscriptionStatus: "REGISTERED",
        }),
    };
    const adapter = new BdappsSmsAdapter(
      gateway as never,
      fakeRedis() as never,
    );
    await adapter.sendOtp({
      challengeId: "c-masked",
      code: "111111",
      expiresInSeconds: 300,
      phoneE164: PHONE,
    });
    await expect(
      adapter.verifyOtp({
        challengeId: "c-masked",
        code: "123456",
        phoneE164: PHONE,
      }),
    ).resolves.toEqual({
      valid: true,
      carrier: { subscriberId: MASKED, subscriptionStatus: "REGISTERED" },
    });
  });

  it("rejects a real subscriber id that belongs to another number", async () => {
    const gateway = {
      post: jest
        .fn()
        .mockResolvedValueOnce({ statusCode: "S1000", referenceNo: "ref-1" })
        .mockResolvedValueOnce({
          statusCode: "S1000",
          subscriberId: "tel:8801899999999",
        }),
    };
    const adapter = new BdappsSmsAdapter(
      gateway as never,
      fakeRedis() as never,
    );
    await adapter.sendOtp({
      challengeId: "c-x",
      code: "1",
      expiresInSeconds: 300,
      phoneE164: PHONE,
    });
    await expect(
      adapter.verifyOtp({
        challengeId: "c-x",
        code: "123456",
        phoneE164: PHONE,
      }),
    ).rejects.toThrow("invalid verification response");
  });

  it.each([
    ["E1850", { valid: false, failure: "invalid" }, true],
    ["E1357", { valid: false, failure: "invalid" }, true],
    ["E1851", { valid: false, failure: "expired" }, false],
    ["E1854", { valid: false, failure: "expired" }, false],
    ["E1852", { valid: false, failure: "attempts_exceeded" }, false],
  ])(
    "maps carrier verify %s without a 503",
    async (statusCode, expected, keepsChallenge) => {
      const gateway = {
        post: jest
          .fn()
          .mockResolvedValueOnce({ statusCode: "S1000", referenceNo: "ref-1" })
          .mockResolvedValueOnce({ statusCode }),
      };
      const redis = fakeRedis();
      const adapter = new BdappsSmsAdapter(gateway as never, redis as never);
      await adapter.sendOtp({
        challengeId: "c-e",
        code: "1",
        expiresInSeconds: 300,
        phoneE164: PHONE,
      });
      await expect(
        adapter.verifyOtp({
          challengeId: "c-e",
          code: "000000",
          phoneE164: PHONE,
        }),
      ).resolves.toEqual(expected);
      expect(redis.values.size).toBe(keepsChallenge ? 1 : 0);
    },
  );

  it("treats unknown verify failures as an operator outage", async () => {
    const gateway = {
      post: jest
        .fn()
        .mockResolvedValueOnce({ statusCode: "S1000", referenceNo: "ref-1" })
        .mockResolvedValueOnce({ statusCode: "E1601" }),
    };
    const adapter = new BdappsSmsAdapter(
      gateway as never,
      fakeRedis() as never,
    );
    await adapter.sendOtp({
      challengeId: "c-o",
      code: "1",
      expiresInSeconds: 300,
      phoneE164: PHONE,
    });
    await expect(
      adapter.verifyOtp({
        challengeId: "c-o",
        code: "000000",
        phoneE164: PHONE,
      }),
    ).rejects.toThrow("could not verify");
  });

  it("falls back to a hashed KAAJ code over the BDApps SMS API for already-registered numbers", async () => {
    const gateway = {
      post: jest
        .fn()
        .mockResolvedValueOnce({ statusCode: "E1351" })
        .mockResolvedValueOnce({ statusCode: "S1000", requestId: "r-1" }),
    };
    const prisma = {
      userOperatorIdentity: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ provider_subscriber_id: MASKED }),
      },
    };
    const redis = fakeRedis();
    const adapter = new BdappsSmsAdapter(
      gateway as never,
      redis as never,
      prisma as never,
    );
    await adapter.sendOtp({
      challengeId: "c-fallback",
      code: "482913",
      expiresInSeconds: 300,
      phoneE164: PHONE,
    });
    expect(gateway.post).toHaveBeenNthCalledWith(1, "otp_request.php", {
      subscriberId: SUBSCRIBER,
    });
    const [endpoint, payload] = gateway.post.mock.calls[1] as [
      string,
      { message: string; subscriberId: string },
    ];
    expect(endpoint).toBe("sms_send.php");
    expect(payload.subscriberId).toBe(MASKED);
    expect(payload.message).toContain("482913");
    expect(payload.message.length).toBeLessThanOrEqual(160);
    // The plain code is never stored.
    expect(JSON.stringify([...redis.values])).not.toContain("482913");
    expect(JSON.stringify([...redis.values])).toContain("kaaj_sms");

    await expect(
      adapter.verifyOtp({
        challengeId: "c-fallback",
        code: "000000",
        phoneE164: PHONE,
      }),
    ).resolves.toEqual({ valid: false, failure: "invalid" });
    await expect(
      adapter.verifyOtp({
        challengeId: "c-fallback",
        code: "482913",
        phoneE164: PHONE,
      }),
    ).resolves.toEqual({
      valid: true,
      carrier: { subscriberId: null, subscriptionStatus: "REGISTERED" },
    });
    expect(gateway.post).toHaveBeenCalledTimes(2);
    expect(redis.values.size).toBe(0);
  });

  it("fails with OPERATOR_SMS_UNAVAILABLE when the fallback SMS cannot be sent", async () => {
    const gateway = {
      post: jest
        .fn()
        .mockResolvedValueOnce({ statusCode: "E1351" })
        .mockResolvedValueOnce({ statusCode: "E1325" }),
    };
    const redis = fakeRedis();
    const adapter = new BdappsSmsAdapter(gateway as never, redis as never);
    await expect(
      adapter.sendOtp({
        challengeId: "c-f",
        code: "1",
        expiresInSeconds: 300,
        phoneE164: PHONE,
      }),
    ).rejects.toMatchObject({
      descriptor: { code: "OPERATOR_SMS_UNAVAILABLE" },
    });
    expect(gateway.post).toHaveBeenLastCalledWith("sms_send.php", {
      message: expect.any(String),
      subscriberId: SUBSCRIBER,
    });
    expect(redis.values.size).toBe(0);
  });

  it("maps carrier OTP request limits to OTP_RATE_LIMITED", async () => {
    const gateway = {
      post: jest.fn().mockResolvedValue({ statusCode: "E1853" }),
    };
    const adapter = new BdappsSmsAdapter(
      gateway as never,
      fakeRedis() as never,
    );
    await expect(
      adapter.sendOtp({
        challengeId: "c-l",
        code: "1",
        expiresInSeconds: 300,
        phoneE164: PHONE,
      }),
    ).rejects.toMatchObject({ descriptor: { code: "OTP_RATE_LIMITED" } });
  });

  it("does not grant operator eligibility from a prefix alone", async () => {
    const gateway = {
      post: jest.fn().mockResolvedValue({
        statusCode: "S1000",
        subscriptionStatus: "UNSUBSCRIBED",
      }),
    };
    const adapter = new BdappsOperatorAdapter(gateway as never);
    await expect(
      adapter.checkEligibility({ operatorCode: "ROBI", phoneE164: PHONE }),
    ).resolves.toEqual({
      carrierStatus: "UNREGISTERED",
      operatorCode: "ROBI",
      providerReference: null,
      status: "PENDING",
    });
    expect(gateway.post).toHaveBeenCalledWith("status.php", {
      subscriberId: SUBSCRIBER,
    });
  });

  it("uses the stored masked id and keeps CHARGE_PENDING distinct from REGISTERED", async () => {
    const gateway = {
      post: jest.fn().mockResolvedValue({
        statusCode: "S1000",
        subscriptionStatus: "PENDING CHARGE",
      }),
    };
    const adapter = new BdappsOperatorAdapter(gateway as never);
    await expect(
      adapter.checkEligibility({
        operatorCode: "ROBI",
        phoneE164: PHONE,
        subscriberId: MASKED,
      }),
    ).resolves.toMatchObject({
      carrierStatus: "CHARGE_PENDING",
      status: "PENDING",
    });
    expect(gateway.post).toHaveBeenCalledWith("status.php", {
      subscriberId: MASKED,
    });
  });

  it("unsubscribes through the gateway and treats E1356 as success", async () => {
    const gateway = {
      post: jest
        .fn()
        .mockResolvedValueOnce({
          statusCode: "S1000",
          subscriptionStatus: "UNREGISTERED",
        })
        .mockResolvedValueOnce({ statusCode: "E1356" })
        .mockResolvedValueOnce({ statusCode: "E1601" }),
    };
    const adapter = new BdappsOperatorAdapter(gateway as never);
    await expect(
      adapter.cancelSubscription({ phoneE164: PHONE, subscriberId: MASKED }),
    ).resolves.toEqual({ carrierStatus: "UNREGISTERED" });
    expect(gateway.post).toHaveBeenCalledWith("unsubscribe.php", {
      subscriberId: MASKED,
    });
    await expect(
      adapter.cancelSubscription({ phoneE164: PHONE }),
    ).resolves.toEqual({
      carrierStatus: "UNREGISTERED",
    });
    await expect(
      adapter.cancelSubscription({ phoneE164: PHONE }),
    ).rejects.toThrow("could not stop");
  });

  it("validates webhook HMAC and rejects a replayed nonce", async () => {
    const redis = fakeRedis();
    const verifier = new BdappsWebhookVerifier(
      new ConfigService({ BDAPPS_INTERNAL_API_KEY: INTERNAL_KEY }),
      redis as never,
    );
    const rawBody = Buffer.from(
      JSON.stringify({ subscriberId: SUBSCRIBER, status: "REGISTERED" }),
    );
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const nonce = "a".repeat(32);
    const signature = createHmac("sha256", INTERNAL_KEY)
      .update(Buffer.concat([rawBody, Buffer.from(timestamp + nonce)]))
      .digest("hex");
    const headers = {
      "x-api-key": INTERNAL_KEY,
      "x-nonce": nonce,
      "x-signature": signature,
      "x-timestamp": timestamp,
    };

    await expect(verifier.verify(headers, rawBody)).resolves.toBeUndefined();
    await expect(verifier.verify(headers, rawBody)).rejects.toThrow(
      "already received",
    );
  });

  it("accepts a valid signature without X-API-Key but rejects a wrong key", async () => {
    const verifier = new BdappsWebhookVerifier(
      new ConfigService({ BDAPPS_INTERNAL_API_KEY: INTERNAL_KEY }),
      fakeRedis() as never,
    );
    const sign = (body: Buffer, nonce: string) => {
      const timestamp = Math.floor(Date.now() / 1_000).toString();
      return {
        "x-nonce": nonce,
        "x-signature": createHmac("sha256", INTERNAL_KEY)
          .update(Buffer.concat([body, Buffer.from(timestamp + nonce)]))
          .digest("hex"),
        "x-timestamp": timestamp,
      };
    };
    const body = Buffer.from(
      JSON.stringify({ subscriberId: MASKED, status: "CHARGE_PENDING" }),
    );
    await expect(
      verifier.verify(sign(body, "c".repeat(32)), body),
    ).resolves.toBeUndefined();
    await expect(
      verifier.verify(
        { ...sign(body, "d".repeat(32)), "x-api-key": "wrong".repeat(10) },
        body,
      ),
    ).rejects.toThrow("Invalid operator webhook signature");
    const unsigned = sign(body, "e".repeat(32));
    await expect(
      verifier.verify({ ...unsigned, "x-signature": "0".repeat(64) }, body),
    ).rejects.toThrow("Invalid operator webhook signature");
  });
});
