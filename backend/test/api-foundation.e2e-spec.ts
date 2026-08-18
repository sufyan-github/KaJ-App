import "reflect-metadata";

import { Body, Controller, Get, INestApplication, Post } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { IsString } from "class-validator";
import request from "supertest";

import { configureApp } from "../src/app.bootstrap";
import { AppModule } from "../src/app.module";
import { CLOCK, Clock } from "../src/common/time/clock";
import {
  REQUEST_ID_GENERATOR,
  RequestIdGenerator,
} from "../src/common/context/request-id.generator";

class ValidationProbeDto {
  @IsString()
  name!: string;
}

@Controller("__test")
class ProbeController {
  @Post("validation")
  validate(@Body() body: ValidationProbeDto): ValidationProbeDto {
    return body;
  }

  @Get("unexpected-error")
  fail(): never {
    throw new Error("internal-secret-must-not-leak");
  }
}

describe("API foundation", () => {
  let app: INestApplication;

  const fixedClock: Clock = {
    now: () => new Date("2026-08-17T12:00:00.000Z"),
  };
  const requestIdGenerator: RequestIdGenerator = {
    generate: () => "test-request-id",
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      imports: [AppModule],
    })
      .overrideProvider(CLOCK)
      .useValue(fixedClock)
      .overrideProvider(REQUEST_ID_GENERATOR)
      .useValue(requestIdGenerator)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it("wraps GET /health in the exact E1 success envelope", async () => {
    const response = await request(app.getHttpServer())
      .get("/health")
      .expect(200);

    expect(response.headers["x-request-id"]).toBe("test-request-id");
    expect(response.body).toEqual({
      data: { status: "ok" },
      meta: {
        requestId: "test-request-id",
        serverTime: "2026-08-17T12:00:00.000Z",
      },
    });
  });

  it("returns the exact E1 error shape for an unknown route", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/missing")
      .expect(404);

    expect(response.headers["x-request-id"]).toBe("test-request-id");
    expect(response.body).toEqual({
      error: {
        action: null,
        code: "NOT_FOUND",
        details: [],
        field: null,
        message: "Resource not found.",
        messageKey: "error.common.not_found",
        requestId: "test-request-id",
        retryable: false,
      },
    });
  });

  it("rejects invalid input with a populated field", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/__test/validation")
      .send({ name: 42 })
      .expect(400);

    expect(response.body.error).toEqual({
      action: null,
      code: "VALIDATION_FAILED",
      details: [],
      field: "name",
      message: "Request validation failed.",
      messageKey: "error.validation.failed",
      requestId: "test-request-id",
      retryable: false,
    });
  });

  it("rejects non-whitelisted input", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/__test/validation")
      .send({ name: "valid", role: "admin" })
      .expect(400);

    expect(response.body.error.field).toBe("role");
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("never leaks unexpected exception details", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/__test/unexpected-error")
      .expect(500);

    expect(JSON.stringify(response.body)).not.toContain(
      "internal-secret-must-not-leak",
    );
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("serves Swagger on the non-production documentation route", async () => {
    const response = await request(app.getHttpServer())
      .get("/docs/")
      .expect(200);

    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain("Swagger UI");
  });
});
