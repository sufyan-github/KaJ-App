import "reflect-metadata";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AssignmentStatus,
  JobStatus,
  PaymentModel,
  PrismaClient,
  RoleMode,
  TrustLevel,
} from "@prisma/client";

import { Clock } from "../src/common/time/clock";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AvailabilityService } from "../src/modules/availability/availability.service";
import { JobsService } from "../src/modules/jobs/jobs.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { ReviewsService } from "../src/modules/reviews/reviews.service";

const databaseDescribe =
  process.env.TRUST_DATABASE_E2E === "1" ? describe : describe.skip;

// Covers the P1 trust fixes against a real database: the job work-site pin,
// cancellation attribution, reputation counting, badge rules and the
// cancellation backfill migration.
databaseDescribe("trust and fairness fixes with PostgreSQL", () => {
  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;
  const now = new Date("2026-11-11T06:00:00.000Z");
  const clock: Clock = { now: () => now };
  const jobs = new JobsService(
    prismaService,
    {} as AvailabilityService,
    undefined,
    undefined,
    clock,
  );
  const reviews = new ReviewsService(
    prismaService,
    new NotificationsService(prismaService),
    clock,
  );
  const userIds: string[] = [];
  const jobIds: string[] = [];
  const runId = `${Date.now()}`.slice(-7);
  let phoneSequence = 0;
  let categoryId: string;
  let locationId: string;

  beforeAll(async () => {
    const [category, location] = await Promise.all([
      prisma.category.findFirstOrThrow(),
      prisma.location.findFirstOrThrow({ where: { type: "AREA" } }),
    ]);
    categoryId = category.id;
    locationId = location.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actor_user_id: { in: userIds } },
    });
    await prisma.$executeRaw`
      DELETE FROM "audit_logs"
      WHERE "entity" = 'UserBadge' AND "after_json" ->> 'userId' = ANY(${userIds})
    `;
    await prisma.userBadge.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.contract.deleteMany({
      where: { assignment: { job_id: { in: jobIds } } },
    });
    await prisma.assignment.deleteMany({ where: { job_id: { in: jobIds } } });
    await prisma.application.deleteMany({ where: { job_id: { in: jobIds } } });
    await prisma.jobStatusHistory.deleteMany({
      where: { job_id: { in: jobIds } },
    });
    await prisma.jobSkill.deleteMany({ where: { job_id: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("stores an explicit work-site pin and never returns it", async () => {
    const poster = await user("pin-poster", RoleMode.CUSTOMER);

    const created = await jobs.create(
      poster.id,
      jobInput({ lat: 24.374012, lng: 88.601235 }),
    );
    jobIds.push(created.id);

    const stored = await prisma.job.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(Number(stored.lat)).toBe(24.374012);
    expect(Number(stored.lng)).toBe(88.601235);
    expect(created).not.toHaveProperty("lat");
    expect(created).not.toHaveProperty("lng");
    const fetched = await jobs.get(created.id, poster.id);
    expect(JSON.stringify(fetched)).not.toContain("24.374012");
  });

  it("falls back to the poster's saved location, or leaves the site empty", async () => {
    const withHome = await user("home-poster", RoleMode.CUSTOMER, {
      lat: 24.3745,
      lng: 88.6042,
    });
    const withoutHome = await user("no-home-poster", RoleMode.CUSTOMER);

    const fromProfile = await jobs.create(withHome.id, jobInput());
    const empty = await jobs.create(withoutHome.id, jobInput());
    jobIds.push(fromProfile.id, empty.id);

    const [first, second] = await Promise.all([
      prisma.job.findUniqueOrThrow({ where: { id: fromProfile.id } }),
      prisma.job.findUniqueOrThrow({ where: { id: empty.id } }),
    ]);
    expect(Number(first.lat)).toBe(24.3745);
    expect(Number(first.lng)).toBe(88.6042);
    expect(second.lat).toBeNull();
    expect(second.lng).toBeNull();
  });

  it("rejects a half pin without creating a job", async () => {
    const poster = await user("half-pin-poster", RoleMode.CUSTOMER);

    await expect(
      jobs.create(poster.id, jobInput({ lat: 24.3745 })),
    ).rejects.toThrow("Send both lat and lng");
    expect(
      await prisma.job.count({ where: { poster_user_id: poster.id } }),
    ).toBe(0);
  });

  it("records who cancelled and counts only penalised worker cancellations", async () => {
    const poster = await user("cancel-poster", RoleMode.CUSTOMER);
    const worker = await user("cancel-worker", RoleMode.WORKER);
    const hour = 3_600_000;

    const byCustomer = await assignment(
      poster.id,
      worker.id,
      now.getTime() + hour,
    );
    const earlyByWorker = await assignment(
      poster.id,
      worker.id,
      now.getTime() + 48 * hour,
    );
    const lateByWorker = await assignment(
      poster.id,
      worker.id,
      now.getTime() + hour,
    );
    await assignment(poster.id, worker.id, now.getTime() - 48 * hour, {
      assignmentStatus: AssignmentStatus.COMPLETED,
      jobStatus: JobStatus.COMPLETED,
    });

    await jobs.cancelAssignment(poster.id, byCustomer, cancel());
    await jobs.cancelAssignment(worker.id, earlyByWorker, cancel());
    await jobs.cancelAssignment(worker.id, lateByWorker, cancel());

    const rows = await prisma.assignment.findMany({
      where: { id: { in: [byCustomer, earlyByWorker, lateByWorker] } },
    });
    const row = (id: string) => rows.find((item) => item.id === id)!;
    expect(row(byCustomer)).toMatchObject({
      cancelled_by_user_id: poster.id,
      cancellation_penalised: false,
    });
    expect(row(earlyByWorker)).toMatchObject({
      cancelled_by_user_id: worker.id,
      cancellation_penalised: false,
    });
    expect(row(lateByWorker)).toMatchObject({
      cancelled_by_user_id: worker.id,
      cancellation_penalised: true,
    });

    await reviews.recomputeAllReputation();
    const profile = await prisma.workerProfile.findUniqueOrThrow({
      where: { user_id: worker.id },
    });
    // 1 completed + 1 penalised cancellation. The customer's and the early
    // cancellation are outside the worker's fault and must not count.
    expect(profile.completed_jobs_count).toBe(1);
    expect(profile.completion_rate_bps).toBe(5000);
    expect(profile.cancellation_rate_bps).toBe(5000);
  });

  it("refuses to cancel a declined assignment", async () => {
    const poster = await user("declined-poster", RoleMode.CUSTOMER);
    const worker = await user("declined-worker", RoleMode.WORKER);
    const declined = await assignment(
      poster.id,
      worker.id,
      now.getTime() + 3_600_000,
      {
        assignmentStatus: AssignmentStatus.DECLINED,
        jobStatus: JobStatus.APPLICATIONS_OPEN,
      },
    );

    await expect(
      jobs.cancelAssignment(worker.id, declined, cancel()),
    ).rejects.toThrow("can no longer be cancelled");
    const job = await prisma.job.findFirstOrThrow({
      where: { assignments: { some: { id: declined } } },
    });
    expect(job.status).toBe(JobStatus.APPLICATIONS_OPEN);
  });

  it("revokes a Verified badge from a phone-only worker and keeps it for ID-checked ones", async () => {
    const phoneOnly = await user(
      "phone-only",
      RoleMode.WORKER,
      undefined,
      TrustLevel.PHONE,
    );
    const idChecked = await user(
      "id-checked",
      RoleMode.WORKER,
      undefined,
      TrustLevel.IDENTITY,
    );
    const verified = await prisma.badge.findUniqueOrThrow({
      where: { slug: "verified" },
    });
    // Simulate the badge the old rule granted to every phone-confirmed worker.
    await prisma.userBadge.create({
      data: { user_id: phoneOnly.id, badge_id: verified.id },
    });

    await reviews.recomputeAllReputation();

    const [phoneBadge, idBadge] = await Promise.all([
      prisma.userBadge.findUniqueOrThrow({
        where: {
          user_id_badge_id: { user_id: phoneOnly.id, badge_id: verified.id },
        },
      }),
      prisma.userBadge.findUnique({
        where: {
          user_id_badge_id: { user_id: idChecked.id, badge_id: verified.id },
        },
      }),
    ]);
    expect(phoneBadge.revoked_at).not.toBeNull();
    expect(idBadge?.revoked_at).toBeNull();
  });

  it("backfills past cancellations from the audit log", async () => {
    const poster = await user("backfill-poster", RoleMode.CUSTOMER);
    const worker = await user("backfill-worker", RoleMode.WORKER);
    const time = now.getTime() + 3_600_000;
    const statuses = {
      assignmentStatus: AssignmentStatus.CANCELLED,
      jobStatus: JobStatus.CANCELLED_BY_WORKER,
    };
    const penalised = await assignment(poster.id, worker.id, time, statuses);
    const customer = await assignment(poster.id, worker.id, time, statuses);
    const emergency = await assignment(poster.id, worker.id, time, statuses);
    const unaudited = await assignment(poster.id, worker.id, time, statuses);
    await prisma.auditLog.createMany({
      data: [
        audit(worker.id, penalised, "CANCELLATION_STRIKE", -10),
        audit(poster.id, customer, "ASSIGNMENT_CANCELLED", 0),
        audit(worker.id, emergency, "ASSIGNMENT_CANCELLED", 0),
      ],
    });

    await prisma.$executeRawUnsafe(backfillStatement());

    const rows = await prisma.assignment.findMany({
      where: { id: { in: [penalised, customer, emergency, unaudited] } },
    });
    const row = (id: string) => rows.find((item) => item.id === id)!;
    expect(row(penalised)).toMatchObject({
      cancelled_by_user_id: worker.id,
      cancellation_penalised: true,
    });
    expect(row(customer)).toMatchObject({
      cancelled_by_user_id: poster.id,
      cancellation_penalised: false,
    });
    expect(row(emergency)).toMatchObject({
      cancelled_by_user_id: worker.id,
      cancellation_penalised: false,
    });
    // No audit trail: left unattributed, which never counts against a worker.
    expect(row(unaudited)).toMatchObject({
      cancelled_by_user_id: null,
      cancellation_penalised: false,
    });
  });

  async function user(
    label: string,
    role: RoleMode,
    home?: { lat: number; lng: number },
    trustLevel: TrustLevel = TrustLevel.PHONE,
  ) {
    phoneSequence += 1;
    const created = await prisma.user.create({
      data: {
        phone_e164: `+8801${runId}${String(phoneSequence).padStart(3, "0")}`,
        active_role: role,
        role_modes: [role],
        profile: {
          create: {
            display_name: `Trust ${label}`,
            trust_level: trustLevel,
            lat: home?.lat,
            lng: home?.lng,
          },
        },
        worker_profile: role === RoleMode.WORKER ? { create: {} } : undefined,
      },
    });
    userIds.push(created.id);
    return created;
  }

  async function assignment(
    posterId: string,
    workerId: string,
    startsAtMs: number,
    statuses: {
      assignmentStatus: AssignmentStatus;
      jobStatus: JobStatus;
    } = {
      assignmentStatus: AssignmentStatus.CONFIRMED,
      jobStatus: JobStatus.CONFIRMED,
    },
  ) {
    const startsAt = new Date(startsAtMs);
    const endsAt = new Date(startsAtMs + 2 * 3_600_000);
    const job = await prisma.job.create({
      data: {
        poster_user_id: posterId,
        title: "Trust fairness fixture",
        description: "A fixture job for cancellation and reputation tests.",
        category_id: categoryId,
        job_type: "ONE_TIME",
        payment_model: PaymentModel.FIXED,
        budget_min_poisha: 50_000,
        budget_max_poisha: 50_000,
        location_id: locationId,
        starts_at: startsAt,
        ends_at: endsAt,
        status: statuses.jobStatus,
        workers_filled: 1,
      },
    });
    jobIds.push(job.id);
    const application = await prisma.application.create({
      data: { job_id: job.id, worker_user_id: workerId, status: "ACCEPTED" },
    });
    const created = await prisma.assignment.create({
      data: {
        job_id: job.id,
        worker_user_id: workerId,
        application_id: application.id,
        agreed_price_poisha: 50_000n,
        agreed_starts_at: startsAt,
        agreed_ends_at: endsAt,
        status: statuses.assignmentStatus,
      },
    });
    return created.id;
  }

  function jobInput(pin: { lat?: number; lng?: number } = {}) {
    return {
      title: "Fix the kitchen tap",
      description: "The kitchen tap leaks and needs a new washer.",
      categoryId,
      skillIds: [],
      jobType: "ONE_TIME" as const,
      paymentModel: PaymentModel.FIXED,
      locationId,
      ...pin,
    };
  }
});

function cancel() {
  return { reasonCode: "CHANGE_OF_PLAN", confirmed: true };
}

function audit(
  actorUserId: string,
  assignmentId: string,
  action: string,
  reliabilityDelta: number,
) {
  return {
    actor_user_id: actorUserId,
    action,
    entity: "Assignment",
    entity_id: assignmentId,
    after_json: { reliabilityDelta, reasonCode: "CHANGE_OF_PLAN" },
  };
}

// Runs the data-repair part of the migration exactly as shipped, so the test
// fails if the migration file and the expected behaviour drift apart.
function backfillStatement() {
  const sql = readFileSync(
    join(
      __dirname,
      "../prisma/migrations/20261111090000_assignment_cancellation_actor/migration.sql",
    ),
    "utf8",
  );
  const start = sql.indexOf("UPDATE");
  if (start < 0) throw new Error("Backfill statement not found in migration.");
  return sql.slice(start).trim().replace(/;$/, "");
}
