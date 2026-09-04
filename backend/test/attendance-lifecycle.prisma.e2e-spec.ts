import "reflect-metadata";

import {
  AdminRole,
  JobStatus,
  PaymentModel,
  PrismaClient,
  RoleMode,
} from "@prisma/client";
import {
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";

import { Clock } from "../src/common/time/clock";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AttendanceService } from "../src/modules/attendance/attendance.service";
import { AvailabilityService } from "../src/modules/availability/availability.service";
import { JobsService } from "../src/modules/jobs/jobs.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";

const databaseDescribe =
  process.env.ATTENDANCE_DATABASE_E2E === "1" ? describe : describe.skip;

databaseDescribe("attendance lifecycle with PostgreSQL", () => {
  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;
  const createdUserIds: string[] = [];
  const createdJobIds: string[] = [];
  let now = new Date("2026-09-04T15:00:00.000Z");
  const clock: Clock = { now: () => now };
  const attendance = new AttendanceService(
    prismaService,
    new NotificationsService(prismaService),
    clock,
  );
  const jobs = new JobsService(prismaService, {} as AvailabilityService);
  let categoryId: string;
  let locationId: string;
  let originalFlag: {
    is_enabled: boolean;
    rollout_percent: number;
  } | null;

  beforeAll(async () => {
    const [category, location, flag] = await Promise.all([
      prisma.category.findFirstOrThrow(),
      prisma.location.findFirstOrThrow({ where: { type: "AREA" } }),
      prisma.featureFlag.findUnique({
        where: { key: "checkin_enabled" },
        select: { is_enabled: true, rollout_percent: true },
      }),
    ]);
    categoryId = category.id;
    locationId = location.id;
    originalFlag = flag;
    await prisma.featureFlag.upsert({
      where: { key: "checkin_enabled" },
      update: { is_enabled: true, rollout_percent: 100 },
      create: {
        key: "checkin_enabled",
        is_enabled: true,
        rollout_percent: 100,
      },
    });
  });

  afterAll(async () => {
    await prisma.workSession.deleteMany({
      where: { assignment: { job_id: { in: createdJobIds } } },
    });
    await prisma.idempotencyRecord.deleteMany({
      where: { actor_user_id: { in: createdUserIds } },
    });
    await prisma.notification.deleteMany({
      where: { user_id: { in: createdUserIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { actor_user_id: { in: createdUserIds } },
    });
    await prisma.contract.deleteMany({
      where: { assignment: { job_id: { in: createdJobIds } } },
    });
    await prisma.assignment.deleteMany({
      where: { job_id: { in: createdJobIds } },
    });
    await prisma.application.deleteMany({
      where: { job_id: { in: createdJobIds } },
    });
    await prisma.jobStatusHistory.deleteMany({
      where: { job_id: { in: createdJobIds } },
    });
    await prisma.job.deleteMany({ where: { id: { in: createdJobIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.featureFlag.update({
      where: { key: "checkin_enabled" },
      data: originalFlag ?? { is_enabled: false, rollout_percent: 0 },
    });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    now = new Date("2026-09-04T15:00:00.000Z");
  });

  it("accepts 299 m, rejects 301 m, and returns the first idempotent result", async () => {
    const inside = await fixture("boundary-in");
    const response = await attendance.checkIn(
      inside.workerId,
      inside.assignmentId,
      checkinInput(pointNorth(299)),
      "boundary-in-key",
    );
    const duplicate = await attendance.checkIn(
      inside.workerId,
      inside.assignmentId,
      checkinInput(pointNorth(299)),
      "boundary-in-key",
    );
    expect(response.checkinDistanceM).toBe(299);
    expect(duplicate).toEqual(response);
    expect(
      await prisma.workSession.count({
        where: { assignment_id: inside.assignmentId },
      }),
    ).toBe(1);

    const outside = await fixture("boundary-out");
    await expect(
      attendance.checkIn(
        outside.workerId,
        outside.assignmentId,
        checkinInput(pointNorth(301)),
        "boundary-out-key",
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("rejects poor accuracy, excessive clock skew, and stale offline sync", async () => {
    const poor = await fixture("poor-accuracy");
    await expect(
      attendance.checkIn(
        poor.workerId,
        poor.assignmentId,
        { ...checkinInput(pointNorth(10)), accuracyM: 101 },
        "poor-key",
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const future = await fixture("clock-future");
    await expect(
      attendance.checkIn(
        future.workerId,
        future.assignmentId,
        {
          ...checkinInput(pointNorth(10)),
          capturedAt: new Date(now.getTime() + 121_000).toISOString(),
        },
        "future-key",
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const stale = await fixture("offline-stale");
    await expect(
      attendance.checkIn(
        stale.workerId,
        stale.assignmentId,
        {
          ...checkinInput(pointNorth(10)),
          capturedAt: new Date(now.getTime() - 16 * 60_000).toISOString(),
        },
        "stale-key",
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("syncs a recent offline check-in with captured and received times", async () => {
    const item = await fixture(
      "offline-valid",
      new Date(now.getTime() - 10 * 60_000),
    );
    const capturedAt = new Date(now.getTime() - 10 * 60_000).toISOString();
    const response = await attendance.checkIn(
      item.workerId,
      item.assignmentId,
      { ...checkinInput(pointNorth(20)), capturedAt },
      "offline-valid-key",
    );
    expect(response.checkinCapturedAt).toBe(capturedAt);
    expect(response.checkinReceivedAt).toBe(now.toISOString());
  });

  it("checks out atomically, computes duration server-side, and opens review", async () => {
    const item = await fixture("checkout");
    await attendance.checkIn(
      item.workerId,
      item.assignmentId,
      checkinInput(pointNorth(25)),
      "checkout-in-key",
    );
    now = new Date(now.getTime() + 65 * 60_000);
    const response = await attendance.checkOut(
      item.workerId,
      item.assignmentId,
      {
        ...checkinInput(pointNorth(30)),
        notes: "Work completed safely.",
      },
      "checkout-out-key",
    );
    expect(response.minutesWorked).toBe(65);
    const [job, assignment] = await Promise.all([
      prisma.job.findUniqueOrThrow({ where: { id: item.jobId } }),
      prisma.assignment.findUniqueOrThrow({
        where: { id: item.assignmentId },
      }),
    ]);
    expect(job.status).toBe(JobStatus.CUSTOMER_REVIEW);
    expect(assignment.submitted_at).toEqual(now);
    expect(assignment.completion_due_at).toEqual(
      new Date(now.getTime() + 48 * 3_600_000),
    );
  });

  it("records a reason and audit trail for a poster override", async () => {
    const item = await fixture("override");
    const response = await attendance.overrideByPoster(
      item.posterId,
      item.assignmentId,
      { reason: "GPS is unavailable inside the building." },
      "override-key",
    );
    expect(response.verifiedBy).toBe("CUSTOMER");
    expect(response.overrideReason).toContain("GPS is unavailable");
    expect(
      await prisma.auditLog.count({
        where: {
          actor_user_id: item.posterId,
          action: "ATTENDANCE_CHECKIN_OVERRIDDEN",
        },
      }),
    ).toBe(1);
  });

  it("allows an authenticated administrator to record an audited override", async () => {
    const item = await fixture("admin-override");
    const admin = await prisma.user.create({
      data: {
        email: `attendance-admin-${createdUserIds.length}@test.local`,
        is_admin: true,
      },
    });
    createdUserIds.push(admin.id);
    const response = await attendance.overrideByAdmin(
      {
        email: admin.email!,
        role: AdminRole.MODERATOR,
        sessionId: "attendance-admin-session",
        userId: admin.id,
      },
      item.assignmentId,
      { reason: "Customer confirmed arrival after GPS failure." },
      "admin-override-key",
      { ip: "127.0.0.1", ua: "attendance-e2e" },
    );
    expect(response.verifiedBy).toBe("ADMIN");
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        actor_user_id: admin.id,
        action: "ATTENDANCE_CHECKIN_OVERRIDDEN",
      },
    });
    expect(audit.ip).toBe("127.0.0.1");
    expect(audit.ua).toBe("attendance-e2e");
  });

  it("fails closed while the feature flag is off", async () => {
    const item = await fixture("flag-off");
    await prisma.featureFlag.update({
      where: { key: "checkin_enabled" },
      data: { is_enabled: false },
    });
    await expect(
      attendance.checkIn(
        item.workerId,
        item.assignmentId,
        checkinInput(pointNorth(10)),
        "flag-off-key",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await prisma.featureFlag.update({
      where: { key: "checkin_enabled" },
      data: { is_enabled: true, rollout_percent: 100 },
    });
  });

  it("blocks the legacy submit path while attendance is enabled", async () => {
    const item = await fixture("legacy-submit");
    await expect(
      jobs.submitWork(item.workerId, item.assignmentId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  async function fixture(label: string, startsAt = now) {
    const suffix = `${Date.now()}${createdJobIds.length}`.slice(-10);
    const [poster, worker] = await Promise.all([
      prisma.user.create({
        data: {
          phone_e164: `+88017${suffix}`,
          active_role: RoleMode.CUSTOMER,
          role_modes: [RoleMode.CUSTOMER],
          profile: { create: { display_name: `${label} poster` } },
        },
      }),
      prisma.user.create({
        data: {
          phone_e164: `+88018${suffix}`,
          active_role: RoleMode.WORKER,
          role_modes: [RoleMode.WORKER],
          profile: { create: { display_name: `${label} worker` } },
          worker_profile: { create: {} },
        },
      }),
    ]);
    createdUserIds.push(poster.id, worker.id);
    const job = await prisma.job.create({
      data: {
        poster_user_id: poster.id,
        title: `Attendance ${label}`,
        description: "A scheduled attendance lifecycle integration fixture.",
        category_id: categoryId,
        job_type: "ONE_TIME",
        payment_model: PaymentModel.FIXED,
        budget_min_poisha: 50_000,
        budget_max_poisha: 50_000,
        location_id: locationId,
        lat: JOB.lat,
        lng: JOB.lng,
        starts_at: startsAt,
        ends_at: new Date(startsAt.getTime() + 2 * 3_600_000),
        status: JobStatus.UPCOMING,
        workers_filled: 1,
      },
    });
    createdJobIds.push(job.id);
    const application = await prisma.application.create({
      data: {
        job_id: job.id,
        worker_user_id: worker.id,
        status: "ACCEPTED",
      },
    });
    const assignment = await prisma.assignment.create({
      data: {
        job_id: job.id,
        worker_user_id: worker.id,
        application_id: application.id,
        agreed_price_poisha: 50_000,
        agreed_starts_at: startsAt,
        agreed_ends_at: new Date(startsAt.getTime() + 2 * 3_600_000),
        status: "CONFIRMED",
        confirmed_at: new Date(startsAt.getTime() - 60_000),
      },
    });
    return {
      assignmentId: assignment.id,
      jobId: job.id,
      posterId: poster.id,
      workerId: worker.id,
    };
  }
});

const JOB = { lat: 24.3745, lng: 88.6042 };

function pointNorth(metres: number) {
  return {
    lat: JOB.lat + (metres / 6_371_000) * (180 / Math.PI),
    lng: JOB.lng,
  };
}

function checkinInput(point: { lat: number; lng: number }) {
  return {
    ...point,
    accuracyM: 10,
    consentGranted: true,
    consentVersion: "location-checkin-v1",
  };
}
