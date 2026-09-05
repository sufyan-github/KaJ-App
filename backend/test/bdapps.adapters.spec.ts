import { createHmac } from "node:crypto";

import { ConfigService } from "@nestjs/config";

import { BdappsGatewayClient } from "../src/infra/bdapps/bdapps-gateway.client";
import {
  fromBdappsSubscriberId,
  toBdappsSubscriberId,
} from "../src/infra/bdapps/bdapps-subscriber";
import { BdappsWebhookVerifier } from "../src/infra/bdapps/bdapps-webhook.verifier";
import { BdappsOperatorAdapter } from "../src/infra/operator/bdapps.adapter";
import { BdappsSmsAdapter } from "../src/infra/sms/bdapps.adapter";

const INTERNAL_KEY = "b".repeat(64);
const PHONE = "+8801812345678";
const SUBSCRIBER = "tel:8801812345678";

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

describe("bdapps adapters", () => {
  afterEach(() => jest.restoreAllMocks());

  it("converts only valid Bangladesh subscriber identifiers", () => {
    expect(toBdappsSubscriberId(PHONE)).toBe(SUBSCRIBER);
    expect(fromBdappsSubscriberId(SUBSCRIBER)).toBe(PHONE);
    expect(fromBdappsSubscriberId("tel:14155552671")).toBeNull();
    expect(() => toBdappsSubscriberId("+14155552671")).toThrow(
      "valid Bangladesh",
    );
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
    ).resolves.toEqual({ valid: true });
    expect(redis.values.size).toBe(0);
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
      operatorCode: "ROBI",
      providerReference: null,
      status: "PENDING",
    });
    expect(gateway.post).toHaveBeenCalledWith("status.php", {
      subscriberId: SUBSCRIBER,
    });
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
});
