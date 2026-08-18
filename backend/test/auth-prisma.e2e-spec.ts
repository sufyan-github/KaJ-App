import "reflect-metadata";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { configureApp } from "../src/app.bootstrap";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { SMS_PORT, SmsPort } from "../src/infra/sms/sms.port";
import {
  AUTH_RATE_LIMITER,
  AuthRateLimiter,
} from "../src/modules/auth/auth-rate-limiter";
import {
  OTP_CODE_GENERATOR,
  OtpCodeGenerator,
} from "../src/modules/auth/otp-code.generator";

const PHONE = "+8801912345678";
const DEVICE_ID = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f541";
const OTP_CODE = "234567";

const allowAll: AuthRateLimiter = {
  consume: async () => ({ allowed: true, retryAfterSeconds: 1 }),
};
const discardSms: SmsPort = { sendOtp: async () => undefined };
const fixedCode: OtpCodeGenerator = { generate: () => OTP_CODE };

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

databaseDescribe("phone OTP authentication with PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_RATE_LIMITER)
      .useValue(allowAll)
      .overrideProvider(SMS_PORT)
      .useValue(discardSms)
      .overrideProvider(OTP_CODE_GENERATOR)
      .useValue(fixedCode)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { phone_e164: PHONE } });
    await prisma.otpChallenge.deleteMany({ where: { phone_e164: PHONE } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { phone_e164: PHONE } });
      await prisma.otpChallenge.deleteMany({ where: { phone_e164: PHONE } });
    }
    if (app) await app.close();
  });

  it("persists only hashes and atomically revokes a reused refresh family", async () => {
    const requested = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/request")
      .send({ phone: PHONE })
      .expect(201);

    const challenge = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: requested.body.data.challengeId },
    });
    expect(challenge.code_hash).not.toBe(OTP_CODE);

    const verified = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/verify")
      .send({
        challengeId: challenge.id,
        code: OTP_CODE,
        deviceId: DEVICE_ID,
      })
      .expect(201);

    const stored = await prisma.refreshToken.findMany({
      where: { user: { phone_e164: PHONE } },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.token_hash).not.toBe(verified.body.data.refreshToken);

    const rotated = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: verified.body.data.refreshToken })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: verified.body.data.refreshToken })
      .expect(401);

    const family = await prisma.refreshToken.findMany({
      where: { user: { phone_e164: PHONE } },
    });
    expect(family).toHaveLength(2);
    expect(family.every((token) => token.revoked_at !== null)).toBe(true);

    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotated.body.data.refreshToken })
      .expect(401);
  });

  it("atomically caps concurrent wrong-code attempts in PostgreSQL", async () => {
    const requested = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/request")
      .send({ phone: PHONE })
      .expect(201);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer()).post("/api/v1/auth/otp/verify").send({
          challengeId: requested.body.data.challengeId,
          code: "765432",
          deviceId: DEVICE_ID,
        }),
      ),
    );
    expect(
      responses.filter((response) => response.status === 401),
    ).toHaveLength(5);
    expect(
      responses.filter((response) => response.status === 429),
    ).toHaveLength(5);

    const challenge = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: requested.body.data.challengeId },
    });
    expect(challenge.attempts).toBe(5);
  });
});
