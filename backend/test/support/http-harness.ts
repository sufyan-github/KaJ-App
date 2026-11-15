import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  ModerationLevel,
  Prisma,
  RoleMode,
  TrustLevel,
  UserStatus,
} from "@prisma/client";
import request from "supertest";

import { configureApp } from "../../src/app.bootstrap";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { AuthTokenService } from "../../src/modules/auth/auth-token.service";

/** A signed-in synthetic user. */
export interface Actor {
  id: string;
  token: string;
}

export interface ActorOptions {
  trust?: TrustLevel;
  displayName?: string;
  moderationLevel?: ModerationLevel;
  status?: UserStatus;
  reverificationRequired?: boolean;
  /** Weekly 08:00–22:00 availability for workers (default true). */
  available?: boolean;
  profile?: Partial<Prisma.ProfileUncheckedCreateWithoutUserInput>;
}

/**
 * The real app (AppModule + configureApp) on an ephemeral port, plus helpers
 * to create signed-in synthetic users and call the API. Synthetic users get
 * phone numbers in the unassigned +88010 mobile range.
 */
export class HttpHarness {
  readonly userIds: string[] = [];

  private constructor(
    readonly app: INestApplication,
    readonly db: PrismaService,
  ) {}

  static async start(
    configure?: (builder: ReturnType<typeof Test.createTestingModule>) => void,
  ): Promise<HttpHarness> {
    const builder = Test.createTestingModule({ imports: [AppModule] });
    configure?.(builder);
    const module = await builder.compile();
    const app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    return new HttpHarness(app, app.get(PrismaService));
  }

  get url(): string {
    const address = this.app.getHttpServer().address() as { port: number };
    return `http://127.0.0.1:${address.port}`;
  }

  async actor(roles: RoleMode[], options: ActorOptions = {}): Promise<Actor> {
    const user = await this.db.user.create({
      data: {
        phone_e164: `+88010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        role_modes: roles,
        active_role: roles[0],
        status: options.status ?? UserStatus.ACTIVE,
        moderation_level: options.moderationLevel ?? ModerationLevel.NONE,
        reverification_required: options.reverificationRequired ?? false,
        profile: {
          create: {
            display_name: options.displayName ?? "Synthetic test user",
            trust_level: options.trust ?? TrustLevel.IDENTITY,
            ...options.profile,
          },
        },
      },
    });
    this.userIds.push(user.id);
    const token = await this.app.get(AuthTokenService).createAccessToken(
      {
        id: user.id,
        phoneE164: user.phone_e164!,
        status: UserStatus.ACTIVE,
        roles,
        activeRole: roles[0]!,
        isAdmin: false,
      },
      randomUUID(),
    );
    if (roles.includes(RoleMode.WORKER)) {
      await this.db.workerProfile.create({ data: { user_id: user.id } });
      if (options.available ?? true)
        await this.db.availabilityRule.createMany({
          data: Array.from({ length: 7 }, (_, day) => ({
            user_id: user.id,
            day_of_week: day,
            start_time: new Date("1970-01-01T08:00:00Z"),
            end_time: new Date("1970-01-01T22:00:00Z"),
          })),
        });
    }
    return { id: user.id, token };
  }

  get(path: string, as?: Actor) {
    const call = request(this.app.getHttpServer()).get(`/api/v1/${path}`);
    return as ? call.auth(as.token, { type: "bearer" }) : call;
  }

  post(path: string, as?: Actor, body: object = {}) {
    const call = request(this.app.getHttpServer()).post(`/api/v1/${path}`);
    return (as ? call.auth(as.token, { type: "bearer" }) : call).send(body);
  }

  put(path: string, as: Actor, body: object = {}) {
    return request(this.app.getHttpServer())
      .put(`/api/v1/${path}`)
      .auth(as.token, { type: "bearer" })
      .send(body);
  }

  delete(path: string, as: Actor) {
    return request(this.app.getHttpServer())
      .delete(`/api/v1/${path}`)
      .auth(as.token, { type: "bearer" });
  }

  async close() {
    await this.app?.close();
  }
}

/** A future one-hour slot on a whole hour, `days` days from now (UTC 04:00). */
export function futureSlot(days = 3) {
  const startsAt = new Date(Date.now() + days * 86_400_000);
  startsAt.setUTCHours(4, 0, 0, 0);
  return { startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000) };
}
