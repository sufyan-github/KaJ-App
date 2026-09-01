import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { Controller, Get, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RoleMode } from "@prisma/client";
import request from "supertest";

import { configureApp } from "../src/app.bootstrap";
import { AppModule } from "../src/app.module";
import { Roles } from "../src/common/decorators/roles.decorator";
import {
  AbilityFactory,
  PolicyResourceContext,
} from "../src/common/policy/ability.factory";
import { Policies } from "../src/common/policy/policy.types";
import { Policy } from "../src/common/policy/policy.decorator";
import {
  AUTH_REPOSITORY,
  AuthRepository,
  AuthSession,
  UpsertDeviceInput,
} from "../src/modules/auth/auth.repository";
import {
  AccessTokenClaims,
  AuthTokenService,
} from "../src/modules/auth/auth-token.service";

const OWNER_ID = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f531";
const OTHER_ID = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f532";
const ADMIN_ID = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f533";
const OWNER_DEVICE = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f541";
const OTHER_DEVICE = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f542";
const ADMIN_DEVICE = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f543";

type ActorName = "owner" | "other" | "admin" | "anonymous";

function claims(
  sub: string,
  deviceId: string,
  isAdmin = false,
): AccessTokenClaims {
  return {
    activeRole: "CUSTOMER",
    deviceId,
    exp: 4_102_444_800,
    iat: 1_787_040_000,
    isAdmin,
    roles: ["CUSTOMER"],
    sub,
    type: "access",
  };
}

const actors: Record<Exclude<ActorName, "anonymous">, AccessTokenClaims> = {
  owner: claims(OWNER_ID, OWNER_DEVICE),
  other: claims(OTHER_ID, OTHER_DEVICE),
  admin: claims(ADMIN_ID, ADMIN_DEVICE, true),
};

describe("authorization ability factory", () => {
  const ability = new AbilityFactory();
  const owner = actors.owner;

  const cases: Array<{
    name: string;
    rules: ReturnType<(typeof Policies)[keyof typeof Policies]>[];
    actor: AccessTokenClaims | undefined;
    resource?: PolicyResourceContext;
    allowed: boolean;
  }> = [
    {
      name: "public permits anonymous",
      rules: [Policies.public()],
      actor: undefined,
      allowed: true,
    },
    {
      name: "authenticated denies anonymous",
      rules: [Policies.authenticated()],
      actor: undefined,
      allowed: false,
    },
    {
      name: "admin permits only an admin claim",
      rules: [Policies.admin()],
      actor: actors.admin,
      allowed: true,
    },
    {
      name: "active role permits an actor holding that role",
      rules: [Policies.role("CUSTOMER")],
      actor: owner,
      allowed: true,
    },
    {
      name: "active role rejects an actor without that role",
      rules: [Policies.role("WORKER")],
      actor: owner,
      allowed: false,
    },
    {
      name: "job poster permits the owning user",
      rules: [Policies.jobPoster()],
      actor: owner,
      resource: { jobPosterId: OWNER_ID },
      allowed: true,
    },
    {
      name: "job poster rejects another user",
      rules: [Policies.jobPoster()],
      actor: owner,
      resource: { jobPosterId: OTHER_ID },
      allowed: false,
    },
    {
      name: "assigned worker permits the assigned user",
      rules: [Policies.assignedWorker()],
      actor: owner,
      resource: { assignedWorkerId: OWNER_ID },
      allowed: true,
    },
    {
      name: "conversation permits a participant",
      rules: [Policies.conversationParticipant()],
      actor: owner,
      resource: { conversationParticipantIds: [OTHER_ID, OWNER_ID] },
      allowed: true,
    },
    {
      name: "resource policy fails closed without loaded context",
      rules: [Policies.jobPoster()],
      actor: owner,
      allowed: false,
    },
    {
      name: "admin alternative permits private resource administration",
      rules: [Policies.jobPoster(), Policies.admin()],
      actor: actors.admin,
      resource: { jobPosterId: OWNER_ID },
      allowed: true,
    },
  ];

  it.each(cases)("$name", ({ rules, actor, resource, allowed }) => {
    expect(ability.canAny(actor, rules, resource)).toBe(allowed);
  });
});

@Controller("authorization-test")
class MissingPolicyController {
  @Get("missing-policy")
  getWithoutPolicy(): { exposed: true } {
    return { exposed: true };
  }
}

@Controller("authorization-test")
class WorkerOnlyController {
  @Get("worker-only")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  getWorkerOnly(): { available: true } {
    return { available: true };
  }
}

describe("authorization endpoint matrix", () => {
  let app: INestApplication;
  const sessions = new Map<string, AuthSession["user"]>();
  const devices = new Map<string, string>();

  beforeAll(async () => {
    for (const actor of Object.values(actors)) {
      sessions.set(actor.sub, {
        activeRole: actor.activeRole,
        id: actor.sub,
        isAdmin: actor.isAdmin,
        phoneE164: `+88017${actor.sub.slice(-8)}`,
        roles: actor.roles,
        status: "ACTIVE",
      });
    }
    devices.set(OWNER_DEVICE, OWNER_ID);
    devices.set(OTHER_DEVICE, OTHER_ID);
    devices.set(ADMIN_DEVICE, ADMIN_ID);

    const repository = {
      findSession: async (userId: string) => {
        const user = sessions.get(userId);
        return user ? { flags: {}, user } : null;
      },
      upsertDevice: async (input: UpsertDeviceInput) => {
        devices.set(input.deviceId, input.userId);
      },
      deleteDevice: async (deviceId: string, userId: string) => {
        if (devices.get(deviceId) !== userId) return false;
        devices.delete(deviceId);
        return true;
      },
    } as unknown as AuthRepository;

    const tokenService = {
      verifyAccessToken: async (token: string) => {
        const actor = actors[token as keyof typeof actors];
        if (!actor) throw new Error("Unknown test access token");
        return actor;
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [MissingPolicyController, WorkerOnlyController],
      imports: [AppModule],
    })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(repository)
      .overrideProvider(AuthTokenService)
      .useValue(tokenService)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const protectedCases: Array<{
    name: string;
    method: "get" | "post";
    path: string;
    body?: Record<string, unknown>;
    expected: Record<ActorName, number>;
  }> = [
    {
      name: "current session",
      method: "get",
      path: "/api/v1/auth/session",
      expected: { owner: 200, other: 200, admin: 200, anonymous: 401 },
    },
    {
      name: "register current device",
      method: "post",
      path: "/api/v1/auth/devices",
      body: { appVersion: "1.0.0", platform: "ANDROID" },
      expected: { owner: 201, other: 201, admin: 201, anonymous: 401 },
    },
  ];

  for (const endpoint of protectedCases) {
    for (const actorName of ["owner", "other", "admin", "anonymous"] as const) {
      it(`${endpoint.name} returns ${endpoint.expected[actorName]} for ${actorName}`, async () => {
        let testRequest = request(app.getHttpServer())[endpoint.method](
          endpoint.path,
        );
        if (actorName !== "anonymous") {
          testRequest = testRequest.set("Authorization", `Bearer ${actorName}`);
        }
        if (endpoint.body) testRequest = testRequest.send(endpoint.body);
        await testRequest.expect(endpoint.expected[actorName]);
      });
    }
  }

  it("hides another user device instead of leaking it with 403", async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/auth/devices/${OTHER_DEVICE}`)
      .set("Authorization", "Bearer owner")
      .expect(404);
    expect(response.body.error.code).toBe("DEVICE_NOT_FOUND");
  });

  it("denies a route that has no explicit policy", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/authorization-test/missing-policy")
      .set("Authorization", "Bearer owner")
      .expect(403);
    expect(response.body.error.code).toBe("AUTH_POLICY_REQUIRED");
  });

  it("returns an actionable 403 when the worker role is required", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/authorization-test/worker-only")
      .set("Authorization", "Bearer owner")
      .expect(403);

    expect(response.body.error).toMatchObject({
      action: { target: "WORKER", type: "activate_role" },
      code: "ROLE_REQUIRED",
      messageKey: "error.auth.role_required",
    });
  });

  it("keeps explicitly public health available anonymously", async () => {
    await request(app.getHttpServer()).get("/health").expect(200);
  });
});
