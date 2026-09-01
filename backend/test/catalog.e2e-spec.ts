import "reflect-metadata";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { configureApp } from "../src/app.bootstrap";
import { AppModule } from "../src/app.module";
import {
  REQUEST_ID_GENERATOR,
  RequestIdGenerator,
} from "../src/common/context/request-id.generator";
import { CLOCK, Clock } from "../src/common/time/clock";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { RedisService } from "../src/infra/redis/redis.service";

describe("catalog API", () => {
  let app: INestApplication;

  const fixedClock: Clock = {
    now: () => new Date("2026-09-01T06:00:00.000Z"),
  };
  const requestIdGenerator: RequestIdGenerator = {
    generate: () => "catalog-request-id",
  };
  const redisClient = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
  };
  const prisma = {
    category: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "01991a2b-3c4d-7000-8000-000000000001",
          parent_id: null,
          slug: "home-services",
          name_en: "Home services",
          name_bn: "বাসার সেবা",
          icon: "home",
          sort_order: 0,
        },
      ]),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(fixedClock)
      .overrideProvider(REQUEST_ID_GENERATOR)
      .useValue(requestIdGenerator)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue({ getClient: () => redisClient })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it("serves the active bilingual category tree without authentication", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/categories?tree=true")
      .expect(200);

    expect(response.body).toEqual({
      data: [
        {
          id: "01991a2b-3c4d-7000-8000-000000000001",
          parentId: null,
          slug: "home-services",
          nameEn: "Home services",
          nameBn: "বাসার সেবা",
          icon: "home",
          sortOrder: 0,
          children: [],
        },
      ],
      meta: {
        requestId: "catalog-request-id",
        serverTime: "2026-09-01T06:00:00.000Z",
      },
    });
  });
});
