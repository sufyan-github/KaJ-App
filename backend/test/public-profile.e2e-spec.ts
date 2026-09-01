import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { configureApp } from "../src/app.bootstrap";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { STORAGE_PORT } from "../src/infra/storage/storage.port";

const WORKER_ID = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f901";

describe("public worker profile endpoint", () => {
  let app: INestApplication;
  const findFirst = jest.fn();
  const createDownloadUrl = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ user: { findFirst } })
      .overrideProvider(STORAGE_PORT)
      .useValue({ createDownloadUrl })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
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

  it("returns the masked D10 projection anonymously", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/users/${WORKER_ID}/public`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: WORKER_ID,
      displayName: "Rahim U.",
      photoUrl: "https://signed.test/photo?expires=300",
      location: { latitude: 24.375, longitude: 88.605 },
      availability: ["EVENING"],
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
      .expect(404);
  });

  it("rejects a malformed public user id", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/users/not-a-uuid/public")
      .expect(400);
  });
});
