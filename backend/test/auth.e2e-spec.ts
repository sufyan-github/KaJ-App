import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { configureApp } from "../src/app.bootstrap";
import { AppModule } from "../src/app.module";
import { CLOCK, Clock } from "../src/common/time/clock";
import { SMS_PORT, SmsOtp, SmsPort } from "../src/infra/sms/sms.port";
import {
  AUTH_RATE_LIMITER,
  AuthRateLimitRequest,
  AuthRateLimitResult,
  AuthRateLimiter,
} from "../src/modules/auth/auth-rate-limiter";
import {
  AUTH_REPOSITORY,
  AuthRepository,
  AuthSession,
  ConsumeChallengeInput,
  CreateOtpChallengeInput,
  RotateRefreshTokenInput,
  StoredOtpChallenge,
  StoredRefreshToken,
  UpsertDeviceInput,
} from "../src/modules/auth/auth.repository";
import {
  OTP_CODE_GENERATOR,
  OtpCodeGenerator,
} from "../src/modules/auth/otp-code.generator";

const PHONE = "+8801712345678";
const DEVICE_ID = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f531";
const OTP_CODE = "123456";

class MutableClock implements Clock {
  current = new Date("2026-08-18T08:00:00.000Z");

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }

  reset(): void {
    this.current = new Date("2026-08-18T08:00:00.000Z");
  }
}

class FakeSmsPort implements SmsPort {
  readonly messages: SmsOtp[] = [];

  async sendOtp(message: SmsOtp): Promise<void> {
    this.messages.push(message);
  }

  reset(): void {
    this.messages.length = 0;
  }
}

class InMemoryRateLimiter implements AuthRateLimiter {
  private readonly counters = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  constructor(private readonly clock: Clock) {}

  async consume(input: AuthRateLimitRequest): Promise<AuthRateLimitResult> {
    const key = `${input.scope}:${input.key}`;
    const now = this.clock.now().getTime();
    const current = this.counters.get(key);
    const counter =
      !current || current.expiresAt <= now
        ? { count: 0, expiresAt: now + input.windowSeconds * 1_000 }
        : current;
    counter.count += 1;
    this.counters.set(key, counter);
    return {
      allowed: counter.count <= input.limit,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((counter.expiresAt - now) / 1_000),
      ),
    };
  }

  reset(): void {
    this.counters.clear();
  }
}

class InMemoryAuthRepository implements AuthRepository {
  private readonly challenges = new Map<string, StoredOtpChallenge>();
  private readonly devices = new Map<string, string>();
  private readonly refreshTokens = new Map<string, StoredRefreshToken>();
  private readonly users = new Map<string, AuthSession["user"]>();

  async createOtpChallenge(
    input: CreateOtpChallengeInput,
  ): Promise<{ id: string }> {
    const id = randomUUID();
    this.challenges.set(id, {
      id,
      attempts: 0,
      codeHash: input.codeHash,
      consumedAt: null,
      expiresAt: input.expiresAt,
      phoneE164: input.phoneE164,
    });
    return { id };
  }

  async findOtpChallenge(id: string): Promise<StoredOtpChallenge | null> {
    return this.challenges.get(id) ?? null;
  }

  async incrementOtpAttempts(
    id: string,
    maxAttempts: number,
  ): Promise<boolean> {
    const challenge = this.challenges.get(id);
    if (!challenge || challenge.attempts >= maxAttempts) return false;
    challenge.attempts += 1;
    return true;
  }

  async consumeChallengeAndCreateSession(
    input: ConsumeChallengeInput,
  ): Promise<{ isNewUser: boolean; user: AuthSession["user"] } | null> {
    const challenge = this.challenges.get(input.challengeId);
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.attempts !== input.expectedAttempts
    ) {
      return null;
    }
    challenge.consumedAt = input.now;

    let user = [...this.users.values()].find(
      (candidate) => candidate.phoneE164 === input.phoneE164,
    );
    const isNewUser = !user;
    user ??= {
      activeRole: "CUSTOMER",
      id: randomUUID(),
      isAdmin: false,
      phoneE164: input.phoneE164,
      roles: ["CUSTOMER"],
      status: "ACTIVE",
    };
    this.users.set(user.id, user);
    this.refreshTokens.set(input.refreshToken.tokenHash, {
      ...input.refreshToken,
      id: randomUUID(),
      revokedAt: null,
      user,
    });
    return { isNewUser, user };
  }

  async findRefreshTokenByHash(
    tokenHash: string,
  ): Promise<StoredRefreshToken | null> {
    return this.refreshTokens.get(tokenHash) ?? null;
  }

  async rotateRefreshToken(input: RotateRefreshTokenInput): Promise<boolean> {
    const current = [...this.refreshTokens.values()].find(
      (token) => token.id === input.currentTokenId,
    );
    if (!current || current.revokedAt) return false;
    current.revokedAt = input.now;
    this.refreshTokens.set(input.nextToken.tokenHash, {
      ...input.nextToken,
      id: randomUUID(),
      revokedAt: null,
      user: current.user,
    });
    return true;
  }

  async revokeRefreshFamily(familyId: string, now: Date): Promise<void> {
    for (const token of this.refreshTokens.values()) {
      if (token.familyId === familyId && !token.revokedAt)
        token.revokedAt = now;
    }
  }

  async revokeRefreshTokenByHash(tokenHash: string, now: Date): Promise<void> {
    const token = this.refreshTokens.get(tokenHash);
    if (token && !token.revokedAt) token.revokedAt = now;
  }

  async findSession(userId: string): Promise<AuthSession | null> {
    const user = this.users.get(userId);
    return user ? { flags: {}, user } : null;
  }

  async upsertDevice(input: UpsertDeviceInput): Promise<void> {
    this.devices.set(input.deviceId, input.userId);
  }

  async deleteDevice(deviceId: string, userId: string): Promise<boolean> {
    if (this.devices.get(deviceId) !== userId) return false;
    this.devices.delete(deviceId);
    return true;
  }

  reset(): void {
    this.challenges.clear();
    this.devices.clear();
    this.refreshTokens.clear();
    this.users.clear();
  }
}

describe("phone OTP authentication", () => {
  let app: INestApplication;
  const clock = new MutableClock();
  const repository = new InMemoryAuthRepository();
  const limiter = new InMemoryRateLimiter(clock);
  const sms = new FakeSmsPort();
  const codeGenerator: OtpCodeGenerator = { generate: () => OTP_CODE };

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET =
      "test-access-secret-that-is-at-least-32-characters";
    process.env.JWT_REFRESH_SECRET =
      "test-refresh-secret-that-is-at-least-32-characters";
    process.env.OTP_RESEND_COOLDOWN_SECONDS = "0";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(repository)
      .overrideProvider(AUTH_RATE_LIMITER)
      .useValue(limiter)
      .overrideProvider(SMS_PORT)
      .useValue(sms)
      .overrideProvider(OTP_CODE_GENERATOR)
      .useValue(codeGenerator)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.OTP_RESEND_COOLDOWN_SECONDS;
    if (app) await app.close();
  });

  beforeEach(() => {
    clock.reset();
    repository.reset();
    limiter.reset();
    sms.reset();
  });

  function requestOtp(phone = PHONE) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/otp/request")
      .send({ phone });
  }

  async function createChallenge(): Promise<string> {
    const response = await requestOtp().expect(201);
    return response.body.data.challengeId as string;
  }

  function verify(challengeId: string, code = OTP_CODE) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/otp/verify")
      .send({ challengeId, code, deviceId: DEVICE_ID });
  }

  async function login() {
    const challengeId = await createChallenge();
    const response = await verify(challengeId).expect(201);
    return response.body.data as {
      accessToken: string;
      refreshToken: string;
      isNewUser: boolean;
    };
  }

  it("normalizes a BD phone and completes the happy path without exposing the code", async () => {
    const response = await requestOtp("01712 345-678").expect(201);

    expect(response.body.data).toEqual({
      challengeId: expect.any(String),
      expiresIn: 300,
    });
    expect(JSON.stringify(response.body)).not.toContain(OTP_CODE);
    expect(sms.messages).toEqual([
      expect.objectContaining({ code: OTP_CODE, phoneE164: PHONE }),
    ]);

    const verified = await verify(response.body.data.challengeId).expect(201);
    expect(verified.body.data).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      isNewUser: true,
    });
    expect(JSON.stringify(verified.body)).not.toContain(OTP_CODE);
  });

  it("rejects non-Bangladesh phone numbers", async () => {
    const response = await requestOtp("+14155552671").expect(400);
    expect(response.body.error.code).toBe("AUTH_INVALID_PHONE");
    expect(response.body.error.field).toBe("phone");
  });

  it("rejects a wrong code", async () => {
    const response = await verify(await createChallenge(), "654321").expect(
      401,
    );
    expect(response.body.error.code).toBe("OTP_INVALID");
  });

  it("rejects an expired challenge", async () => {
    const challengeId = await createChallenge();
    clock.advance(301_000);
    const response = await verify(challengeId).expect(422);
    expect(response.body.error.code).toBe("OTP_EXPIRED");
  });

  it("invalidates a challenge after five wrong attempts and rejects the sixth", async () => {
    const challengeId = await createChallenge();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await verify(challengeId, "654321").expect(401);
    }
    const response = await verify(challengeId, "654321").expect(429);
    expect(response.body.error.code).toBe("OTP_ATTEMPTS_EXCEEDED");
  });

  it("atomically caps parallel wrong-code attempts", async () => {
    const challengeId = await createChallenge();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => verify(challengeId, "654321")),
    );
    expect(
      responses.filter((response) => response.status === 401),
    ).toHaveLength(5);
    expect(
      responses.filter((response) => response.status === 429),
    ).toHaveLength(5);
  });

  it("rejects a replayed consumed challenge", async () => {
    const challengeId = await createChallenge();
    await verify(challengeId).expect(201);
    const response = await verify(challengeId).expect(409);
    expect(response.body.error.code).toBe("OTP_ALREADY_USED");
  });

  it("rate limits the sixth request for one phone with Retry-After", async () => {
    for (let requestNumber = 0; requestNumber < 5; requestNumber += 1) {
      await requestOtp().expect(201);
      clock.advance(61_000);
    }
    const response = await requestOtp().expect(429);
    expect(response.headers["retry-after"]).toBe("3295");
    expect(response.body.error.code).toBe("OTP_RATE_LIMITED");
  });

  it("rotates refresh tokens and revokes the family when an old token is reused", async () => {
    const first = await login();
    const rotated = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: first.refreshToken })
      .expect(201);

    expect(rotated.body.data.refreshToken).not.toBe(first.refreshToken);
    const reuse = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    expect(reuse.body.error.code).toBe("REFRESH_REUSE_DETECTED");

    const familyRevoked = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotated.body.data.refreshToken })
      .expect(401);
    expect(familyRevoked.body.error.code).toBe("REFRESH_REUSE_DETECTED");
  });

  it("accepts a valid access token on session and rejects it after expiry", async () => {
    const session = await login();
    const active = await request(app.getHttpServer())
      .get("/api/v1/auth/session")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .expect(200);
    expect(active.body.data.user.phoneE164).toBe(PHONE);

    clock.advance(15 * 60_000 + 1_000);
    const expired = await request(app.getHttpServer())
      .get("/api/v1/auth/session")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .expect(401);
    expect(expired.body.error.code).toBe("ACCESS_TOKEN_INVALID");
  });

  it("revokes a refresh token on logout", async () => {
    const session = await login();
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .send({ refreshToken: session.refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });

  it("revokes the complete refresh family on logout-all", async () => {
    const session = await login();
    const rotated = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: session.refreshToken })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/v1/auth/logout-all")
      .send({ refreshToken: rotated.body.data.refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotated.body.data.refreshToken })
      .expect(401);
  });

  it("registers and deletes the access token's device", async () => {
    const session = await login();
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/devices")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({
        appVersion: "1.0.0",
        fcmToken: "test-fcm-token",
        platform: "ANDROID",
      })
      .expect(201);
    expect(registered.body.data.id).toBe(DEVICE_ID);

    await request(app.getHttpServer())
      .delete(`/api/v1/auth/devices/${DEVICE_ID}`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/v1/auth/devices/${DEVICE_ID}`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .expect(404);
  });
});
