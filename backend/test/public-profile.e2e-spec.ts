import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { configureApp } from "../src/app.bootstrap";
import { AppModule } from "../src/app.module";
import { ACCOUNT_MODERATION_READER } from "../src/common/guards/account-moderation.reader";
import { AuthTokenService } from "../src/modules/auth/auth-token.service";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { STORAGE_PORT } from "../src/infra/storage/storage.port";

const WORKER_ID = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f901";
// API-6: these routes need a sign-in. The stub accepts this one token as the
// worker viewing their own profile (no block or engagement lookups).
const TOKEN = "Bearer test-access-token";

describe("public worker profile endpoint", () => {
  let app: INestApplication;
  const findFirst = jest.fn();
  const certificates = jest.fn();
  const createDownloadUrl = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        user: { findFirst },
        trainingCertificate: { findMany: certificates },
      })
      .overrideProvider(STORAGE_PORT)
      .useValue({ createDownloadUrl })
      .overrideProvider(ACCOUNT_MODERATION_READER)
      .useValue({
        findAccount: async () => ({
          status: "ACTIVE",
          deleted_at: null,
          reverification_required: false,
          moderation_level: "NONE",
          restriction_ends_at: null,
        }),
      })
      .overrideProvider(AuthTokenService)
      .useValue({
        verifyAccessToken: async (token: string) => {
          if (token !== TOKEN.slice(7)) throw new Error("invalid");
          return {
            sub: WORKER_ID,
            type: "access",
            deviceId: "test-device",
            roles: ["WORKER"],
          };
        },
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    certificates.mockResolvedValue([]);
    createDownloadUrl.mockResolvedValue({
      downloadUrl: "https://signed.test/photo?expires=300",
      expiresAt: new Date("2026-09-01T12:05:00Z"),
      key: "profile/worker/large.webp",
    });
    findFirst.mockResolvedValue({
      id: WORKER_ID,
      profile: {
        display_name: "Rahim Uddin",
        photo_key: "profile/worker/large.webp",
        lat: { toNumber: () => 24.37421 },
        lng: { toNumber: () => 88.60412 },
        trust_level: "PHONE",
        primary_location: { name_en: "Talaimari", name_bn: "তালাইমারি" },
      },
      worker_profile: {
        rating_avg: { toString: () => "4.70" },
        rating_count: 12,
        completed_jobs_count: 8,
      },
      skills: [],
      availability_rules: [{ start_time: new Date("1970-01-01T19:00:00Z") }],
    });
  });

  it("needs a sign-in for the profile and the directory (API-6)", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/users/${WORKER_ID}/public`)
      .expect(401);
    await request(app.getHttpServer()).get("/api/v1/users/workers").expect(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns the masked D10 projection to a signed-in viewer", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/users/${WORKER_ID}/public`)
      .set("Authorization", TOKEN)
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: WORKER_ID,
      displayName: "Rahim U.",
      photoUrl: "https://signed.test/photo?expires=300",
      location: { latitude: 24.375, longitude: 88.605 },
      availability: ["EVENING"],
      trainings: [],
    });
    const serialized = JSON.stringify(response.body.data);
    expect(serialized).not.toMatch(
      /phone|email|document|photoKey|exactAddress/,
    );
  });

  it("returns 404 for a missing, inactive, or non-worker account", async () => {
    findFirst.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get(`/api/v1/users/${WORKER_ID}/public`)
      .set("Authorization", TOKEN)
      .expect(404);
  });

  it("rejects a malformed public user id", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/users/not-a-uuid/public")
      .set("Authorization", TOKEN)
      .expect(400);
  });

  it.each(["skillId", "locationId"])(
    "rejects malformed directory %s before querying storage",
    async (field) => {
      await request(app.getHttpServer())
        .get(`/api/v1/users/workers?${field}=not-a-uuid`)
        .set("Authorization", TOKEN)
        .expect(400);
    },
  );
});
