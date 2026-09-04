import { createHash } from "node:crypto";

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  AssignmentStatus,
  JobActorType,
  JobStatus,
  Prisma,
  type WorkSession,
  WorkVerification,
} from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import { NotificationsService } from "../notifications/notifications.service";
import { JobStateMachine } from "../jobs/state-machine/job-state.machine";
import {
  AttendanceOverrideDto,
  CheckInDto,
  CheckOutDto,
} from "./dto/attendance.dto";
import { distanceMetres, isInsideGeofence } from "./geofence";

interface AttendanceSettings {
  geofenceRadiusM: number;
  checkinWindowMinutes: number;
  maxAccuracyM: number;
  maxOfflineSyncMinutes: number;
  maxClockSkewSeconds: number;
  consentVersion: string;
}

const DEFAULT_SETTINGS: AttendanceSettings = {
  geofenceRadiusM: 300,
  checkinWindowMinutes: 60,
  maxAccuracyM: 100,
  maxOfflineSyncMinutes: 15,
  maxClockSkewSeconds: 120,
  consentVersion: "location-checkin-v1",
};

@Injectable()
export class AttendanceService {
  private readonly states = new JobStateMachine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(userId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        OR: [{ worker_user_id: userId }, { job: { poster_user_id: userId } }],
      },
      include: { job: true, work_sessions: true },
    });
    if (!assignment) throw new NotFoundException();
    const settings = await this.settings(this.prisma);
    return this.project(
      assignment.work_sessions[0] ?? null,
      assignment,
      settings,
    );
  }

  async checkIn(
    workerUserId: string,
    assignmentId: string,
    input: CheckInDto,
    idempotencyKey: string,
  ) {
    const result = await this.idempotent(
      workerUserId,
      idempotencyKey,
      `attendance.checkin:${assignmentId}`,
      input,
      async (transaction) => {
        const settings = await this.assertEnabled(transaction);
        this.assertConsent(input, settings);
        this.assertAccuracy(input.accuracyM, settings);
        const receivedAt = this.clock.now();
        const capturedAt = this.eventTime(
          input.capturedAt,
          receivedAt,
          settings,
        );
        const assignment = await transaction.assignment.findUnique({
          where: { id: assignmentId },
          include: { job: true, work_sessions: true },
        });
        if (
          !assignment ||
          assignment.worker_user_id !== workerUserId ||
          assignment.status !== AssignmentStatus.CONFIRMED
        ) {
          throw new NotFoundException();
        }
        if (assignment.work_sessions[0]?.checkin_at) {
          throw new ConflictException("This assignment is already checked in.");
        }
        this.assertWindow(assignment.agreed_starts_at, capturedAt, settings);
        const location = this.jobLocation(assignment.job);
        const distanceM = distanceMetres(location, {
          lat: input.lat,
          lng: input.lng,
        });
        this.assertInside(distanceM, settings);
        const photoKey = await this.photoKey(
          transaction,
          workerUserId,
          input.photoDocumentId,
        );

        let job = assignment.job;
        if (job.status === JobStatus.CONFIRMED) {
          job = await this.states.transitionInTransaction(
            transaction,
            job,
            JobStatus.UPCOMING,
            { type: JobActorType.SYSTEM },
            "Attendance window opened",
          );
        }
        if (job.status === JobStatus.UPCOMING) {
          job = await this.states.transitionInTransaction(
            transaction,
            job,
            JobStatus.CHECKED_IN,
            { type: JobActorType.WORKER, userId: workerUserId },
          );
          await this.states.transitionInTransaction(
            transaction,
            job,
            JobStatus.IN_PROGRESS,
            { type: JobActorType.WORKER, userId: workerUserId },
            "Work started after check-in",
          );
        } else if (job.status !== JobStatus.IN_PROGRESS) {
          throw new ConflictException("This job cannot be checked in now.");
        }

        const session = await transaction.workSession.create({
          data: {
            assignment_id: assignment.id,
            checkin_at: capturedAt,
            checkin_captured_at: capturedAt,
            checkin_received_at: receivedAt,
            checkin_lat: input.lat,
            checkin_lng: input.lng,
            checkin_accuracy_m: input.accuracyM,
            checkin_distance_m: Math.round(distanceM),
            checkin_photo_key: photoKey,
            checkin_consent_version: settings.consentVersion,
            checkin_mock_location: input.mockLocation ?? false,
            verified_by: WorkVerification.SYSTEM,
          },
        });
        if (input.mockLocation) {
          await transaction.auditLog.create({
            data: {
              actor_user_id: workerUserId,
              action: "ATTENDANCE_MOCK_LOCATION_REPORTED",
              entity: "WORK_SESSION",
              entity_id: session.id,
              after_json: {
                assignmentId,
                event: "CHECKIN",
                reviewRequired: true,
              },
            },
          });
        }
        return this.sessionResponse(session, settings);
      },
    );
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { job: true },
    });
    if (assignment) {
      await this.notifications.create({
        userId: assignment.job.poster_user_id,
        type: "WORKER_CHECKED_IN",
        title: "কর্মী চেক-ইন করেছেন",
        body: `কর্মী ${assignment.job.title} কাজের স্থানে পৌঁছে চেক-ইন করেছেন।`,
        payload: { route: "/assignments", assignmentId },
        dedupeKey: `assignment:${assignmentId}:checked-in`,
      });
    }
    return result;
  }

  async checkOut(
    workerUserId: string,
    assignmentId: string,
    input: CheckOutDto,
    idempotencyKey: string,
  ) {
    const result = await this.idempotent(
      workerUserId,
      idempotencyKey,
      `attendance.checkout:${assignmentId}`,
      input,
      async (transaction) => {
        const settings = await this.assertEnabled(transaction);
        this.assertConsent(input, settings);
        this.assertAccuracy(input.accuracyM, settings);
        const receivedAt = this.clock.now();
        const capturedAt = this.eventTime(
          input.capturedAt,
          receivedAt,
          settings,
        );
        const assignment = await transaction.assignment.findUnique({
          where: { id: assignmentId },
          include: { job: true, work_sessions: true },
        });
        if (
          !assignment ||
          assignment.worker_user_id !== workerUserId ||
          assignment.status !== AssignmentStatus.CONFIRMED
        ) {
          throw new NotFoundException();
        }
        const session = assignment.work_sessions[0];
        if (!session?.checkin_at) {
          throw new ConflictException("Check-in is required before check-out.");
        }
        if (session.checkout_at) {
          throw new ConflictException(
            "This assignment is already checked out.",
          );
        }
        if (capturedAt < session.checkin_at) {
          throw new UnprocessableEntityException(
            "Check-out cannot be earlier than check-in.",
          );
        }
        if (assignment.job.status !== JobStatus.IN_PROGRESS) {
          throw new ConflictException("This job cannot be checked out now.");
        }
        const distanceM = distanceMetres(this.jobLocation(assignment.job), {
          lat: input.lat,
          lng: input.lng,
        });
        this.assertInside(distanceM, settings);
        const minutesWorked = Math.max(
          0,
          Math.floor(
            (capturedAt.getTime() - session.checkin_at.getTime()) / 60_000,
          ),
        );
        const submitted = await this.states.transitionInTransaction(
          transaction,
          assignment.job,
          JobStatus.SUBMITTED,
          { type: JobActorType.WORKER, userId: workerUserId },
          "Worker checked out",
        );
        await this.states.transitionInTransaction(
          transaction,
          submitted,
          JobStatus.CUSTOMER_REVIEW,
          { type: JobActorType.SYSTEM },
        );
        const assignmentSettings = await this.assignmentSettings(transaction);
        await transaction.assignment.update({
          where: { id: assignmentId },
          data: {
            submitted_at: capturedAt,
            completion_due_at: new Date(
              capturedAt.getTime() +
                assignmentSettings.autoConfirmHours * 3_600_000,
            ),
          },
        });
        const updated = await transaction.workSession.update({
          where: { id: session.id },
          data: {
            checkout_at: capturedAt,
            checkout_captured_at: capturedAt,
            checkout_received_at: receivedAt,
            checkout_lat: input.lat,
            checkout_lng: input.lng,
            checkout_accuracy_m: input.accuracyM,
            checkout_distance_m: Math.round(distanceM),
            checkout_notes: input.notes?.trim() || null,
            minutes_worked: minutesWorked,
          },
        });
        return this.sessionResponse(updated, settings);
      },
    );
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { job: true },
    });
    if (assignment) {
      await this.notifications.create({
        userId: assignment.job.poster_user_id,
        type: "WORK_SUBMITTED",
        title: "কাজ জমা হয়েছে",
        body: `${assignment.job.title} কাজটি পর্যালোচনা করে নিশ্চিত করুন।`,
        payload: { route: "/assignments", assignmentId },
        dedupeKey: `assignment:${assignmentId}:submitted`,
      });
    }
    return result;
  }

  overrideByPoster(
    posterUserId: string,
    assignmentId: string,
    input: AttendanceOverrideDto,
    idempotencyKey: string,
  ) {
    return this.override(
      { type: JobActorType.POSTER, userId: posterUserId },
      assignmentId,
      input,
      idempotencyKey,
      null,
    );
  }

  overrideByAdmin(
    actor: AdminActor,
    assignmentId: string,
    input: AttendanceOverrideDto,
    idempotencyKey: string,
    context: AdminRequestContext,
  ) {
    return this.override(
      { type: JobActorType.ADMIN, userId: actor.userId },
      assignmentId,
      input,
      idempotencyKey,
      context,
    );
  }

  private async override(
    actor: { type: JobActorType; userId: string },
    assignmentId: string,
    input: AttendanceOverrideDto,
    idempotencyKey: string,
    context: AdminRequestContext | null,
  ) {
    return this.idempotent(
      actor.userId,
      idempotencyKey,
      `attendance.checkin-override:${assignmentId}`,
      input,
      async (transaction) => {
        const settings = await this.assertEnabled(transaction);
        const now = this.clock.now();
        const assignment = await transaction.assignment.findUnique({
          where: { id: assignmentId },
          include: { job: true, work_sessions: true },
        });
        if (!assignment || assignment.status !== AssignmentStatus.CONFIRMED) {
          throw new NotFoundException();
        }
        if (
          actor.type === JobActorType.POSTER &&
          assignment.job.poster_user_id !== actor.userId
        ) {
          throw new NotFoundException();
        }
        if (assignment.work_sessions[0]?.checkin_at) {
          throw new ConflictException("This assignment is already checked in.");
        }
        this.assertWindow(assignment.agreed_starts_at, now, settings);
        let job = assignment.job;
        if (job.status === JobStatus.CONFIRMED) {
          job = await this.states.transitionInTransaction(
            transaction,
            job,
            JobStatus.UPCOMING,
            { type: JobActorType.SYSTEM },
            "Attendance window opened",
          );
        }
        if (job.status === JobStatus.UPCOMING) {
          await this.states.transitionInTransaction(
            transaction,
            job,
            JobStatus.IN_PROGRESS,
            { type: JobActorType.SYSTEM },
            "Manual attendance override",
          );
        } else if (job.status !== JobStatus.IN_PROGRESS) {
          throw new ConflictException("This job cannot be checked in now.");
        }
        const verifiedBy =
          actor.type === JobActorType.ADMIN
            ? WorkVerification.ADMIN
            : WorkVerification.CUSTOMER;
        const session = await transaction.workSession.create({
          data: {
            assignment_id: assignment.id,
            checkin_at: now,
            checkin_captured_at: now,
            checkin_received_at: now,
            verified_by: verifiedBy,
            override_reason: input.reason.trim(),
            overridden_by_user_id: actor.userId,
            overridden_by_actor_type: actor.type,
            overridden_at: now,
          },
        });
        await transaction.auditLog.create({
          data: {
            actor_user_id: actor.userId,
            action: "ATTENDANCE_CHECKIN_OVERRIDDEN",
            entity: "WORK_SESSION",
            entity_id: session.id,
            before_json: Prisma.JsonNull,
            after_json: {
              assignmentId,
              actorType: actor.type,
              reason: input.reason.trim(),
            },
            ip: context?.ip ?? null,
            ua: context?.ua ?? null,
          },
        });
        return this.sessionResponse(session, settings);
      },
    );
  }

  private async idempotent<T extends object>(
    actorUserId: string,
    key: string,
    operation: string,
    input: unknown,
    mutate: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const requestHash = createHash("sha256")
      .update(stableJson(input))
      .digest("hex");
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actorUserId}:${key}`}, 0))`,
      );
      const existing = await transaction.idempotencyRecord.findUnique({
        where: { actor_user_id_key: { actor_user_id: actorUserId, key } },
      });
      if (existing) {
        if (
          existing.operation !== operation ||
          existing.request_hash !== requestHash
        ) {
          throw new ConflictException(
            "This Idempotency-Key was already used for a different request.",
          );
        }
        if (existing.response_json) return existing.response_json as T;
      }
      const result = await mutate(transaction);
      const response = result as Prisma.InputJsonObject;
      if (existing) {
        await transaction.idempotencyRecord.update({
          where: { id: existing.id },
          data: {
            response_json: response,
            response_code: 201,
            completed_at: this.clock.now(),
          },
        });
      } else {
        await transaction.idempotencyRecord.create({
          data: {
            actor_user_id: actorUserId,
            key,
            operation,
            request_hash: requestHash,
            response_json: response,
            response_code: 201,
            completed_at: this.clock.now(),
            expires_at: new Date(this.clock.now().getTime() + 86_400_000),
          },
        });
      }
      return result;
    });
  }

  private async assertEnabled(transaction: Prisma.TransactionClient) {
    const flag = await transaction.featureFlag.findUnique({
      where: { key: "checkin_enabled" },
    });
    if (flag?.is_enabled !== true || flag.rollout_percent !== 100) {
      throw new ConflictException("Check-in is not enabled.");
    }
    return this.settings(transaction);
  }

  private async settings(client: {
    configSetting: {
      findUnique: (input: {
        where: { key: string };
      }) => Promise<{ value_json: Prisma.JsonValue } | null>;
    };
  }): Promise<AttendanceSettings> {
    const setting = await client.configSetting.findUnique({
      where: { key: "attendance.settings" },
    });
    const value = record(setting?.value_json);
    return {
      geofenceRadiusM:
        positiveInteger(value?.geofenceRadiusM, 20, 5_000) ??
        DEFAULT_SETTINGS.geofenceRadiusM,
      checkinWindowMinutes:
        positiveInteger(value?.checkinWindowMinutes, 5, 240) ??
        DEFAULT_SETTINGS.checkinWindowMinutes,
      maxAccuracyM:
        positiveInteger(value?.maxAccuracyM, 5, 1_000) ??
        DEFAULT_SETTINGS.maxAccuracyM,
      maxOfflineSyncMinutes:
        positiveInteger(value?.maxOfflineSyncMinutes, 0, 120) ??
        DEFAULT_SETTINGS.maxOfflineSyncMinutes,
      maxClockSkewSeconds:
        positiveInteger(value?.maxClockSkewSeconds, 0, 600) ??
        DEFAULT_SETTINGS.maxClockSkewSeconds,
      consentVersion:
        typeof value?.consentVersion === "string"
          ? value.consentVersion
          : DEFAULT_SETTINGS.consentVersion,
    };
  }

  private assertConsent(
    input: { consentGranted: boolean; consentVersion: string },
    settings: AttendanceSettings,
  ) {
    if (
      input.consentGranted !== true ||
      input.consentVersion !== settings.consentVersion
    ) {
      throw new UnprocessableEntityException(
        "Current explicit location consent is required.",
      );
    }
  }

  private assertAccuracy(accuracyM: number, settings: AttendanceSettings) {
    if (accuracyM > settings.maxAccuracyM) {
      throw new UnprocessableEntityException(
        `Location accuracy is too low (${accuracyM} m). Try again outdoors or request an override.`,
      );
    }
  }

  private eventTime(
    capturedAtValue: string | undefined,
    receivedAt: Date,
    settings: AttendanceSettings,
  ) {
    const capturedAt = capturedAtValue ? new Date(capturedAtValue) : receivedAt;
    if (
      capturedAt.getTime() >
      receivedAt.getTime() + settings.maxClockSkewSeconds * 1_000
    ) {
      throw new UnprocessableEntityException(
        "The device clock is too far ahead of server time.",
      );
    }
    if (
      capturedAt.getTime() <
      receivedAt.getTime() - settings.maxOfflineSyncMinutes * 60_000
    ) {
      throw new UnprocessableEntityException(
        "The offline attendance event is too old to sync safely.",
      );
    }
    return capturedAt;
  }

  private assertWindow(
    startsAt: Date | null,
    eventAt: Date,
    settings: AttendanceSettings,
  ) {
    if (!startsAt) {
      throw new UnprocessableEntityException(
        "The assignment has no agreed start time.",
      );
    }
    const delta = Math.abs(eventAt.getTime() - startsAt.getTime());
    if (delta > settings.checkinWindowMinutes * 60_000) {
      throw new UnprocessableEntityException(
        `Check-in is allowed within ${settings.checkinWindowMinutes} minutes of the agreed start time.`,
      );
    }
  }

  private jobLocation(job: {
    lat: Prisma.Decimal | null;
    lng: Prisma.Decimal | null;
  }) {
    if (job.lat === null || job.lng === null) {
      throw new UnprocessableEntityException(
        "This job has no check-in coordinates. Request a manual override.",
      );
    }
    return { lat: Number(job.lat), lng: Number(job.lng) };
  }

  private assertInside(distanceM: number, settings: AttendanceSettings) {
    if (!isInsideGeofence(distanceM, settings.geofenceRadiusM)) {
      throw new UnprocessableEntityException(
        `You are ${Math.round(distanceM)} m from the job location. Move within ${settings.geofenceRadiusM} m or request an override.`,
      );
    }
  }

  private async photoKey(
    transaction: Prisma.TransactionClient,
    userId: string,
    documentId: string | undefined,
  ) {
    if (!documentId) return null;
    const document = await transaction.document.findFirst({
      where: {
        id: documentId,
        user_id: userId,
        kind: "CHECKIN_PHOTO",
        deleted_at: null,
      },
      select: { storage_key: true },
    });
    if (!document) throw new NotFoundException("Check-in photo not found.");
    return document.storage_key;
  }

  private async assignmentSettings(transaction: Prisma.TransactionClient) {
    const setting = await transaction.configSetting.findUnique({
      where: { key: "assignment.settings" },
    });
    const value = record(setting?.value_json);
    return {
      autoConfirmHours: positiveInteger(value?.autoConfirmHours, 1, 720) ?? 48,
    };
  }

  private project(
    session: WorkSession | null,
    assignment: {
      agreed_starts_at: Date | null;
      job: { status: JobStatus };
    },
    settings: AttendanceSettings,
  ) {
    return {
      assignmentStatus: assignment.job.status,
      agreedStartsAt: assignment.agreed_starts_at?.toISOString() ?? null,
      settings: this.publicSettings(settings),
      session: session ? this.sessionResponse(session, settings) : null,
      locationUse: "foreground-event-only",
      backgroundTracking: false,
      consent: {
        version: settings.consentVersion,
        bn: "এই কাজের চেক-ইন বা চেক-আউট যাচাই করতে শুধু এখনকার অবস্থান একবার ব্যবহার করা হবে। ব্যাকগ্রাউন্ডে অবস্থান ট্র্যাক করা হবে না।",
        en: "Your location is read once only to verify this check-in or check-out. KAAJ does not track location in the background.",
      },
    };
  }

  private sessionResponse(
    session: {
      id: string;
      checkin_at: Date | null;
      checkin_captured_at: Date | null;
      checkin_received_at: Date | null;
      checkin_distance_m: number | null;
      checkin_accuracy_m: Prisma.Decimal | null;
      checkin_mock_location: boolean;
      checkout_at: Date | null;
      checkout_captured_at: Date | null;
      checkout_received_at: Date | null;
      checkout_distance_m: number | null;
      checkout_accuracy_m: Prisma.Decimal | null;
      minutes_worked: number | null;
      verified_by: WorkVerification | null;
      override_reason: string | null;
      overridden_by_actor_type: JobActorType | null;
    },
    settings: AttendanceSettings,
  ) {
    return {
      id: session.id,
      checkinAt: session.checkin_at?.toISOString() ?? null,
      checkinCapturedAt: session.checkin_captured_at?.toISOString() ?? null,
      checkinReceivedAt: session.checkin_received_at?.toISOString() ?? null,
      checkinDistanceM: session.checkin_distance_m,
      checkinAccuracyM: session.checkin_accuracy_m
        ? Number(session.checkin_accuracy_m)
        : null,
      mockLocationReported: session.checkin_mock_location,
      checkoutAt: session.checkout_at?.toISOString() ?? null,
      checkoutCapturedAt: session.checkout_captured_at?.toISOString() ?? null,
      checkoutReceivedAt: session.checkout_received_at?.toISOString() ?? null,
      checkoutDistanceM: session.checkout_distance_m,
      checkoutAccuracyM: session.checkout_accuracy_m
        ? Number(session.checkout_accuracy_m)
        : null,
      minutesWorked: session.minutes_worked,
      verifiedBy: session.verified_by,
      overrideReason: session.override_reason,
      overriddenByActorType: session.overridden_by_actor_type,
      settings: this.publicSettings(settings),
    };
  }

  private publicSettings(settings: AttendanceSettings) {
    return {
      geofenceRadiusM: settings.geofenceRadiusM,
      checkinWindowMinutes: settings.checkinWindowMinutes,
      maxAccuracyM: settings.maxAccuracyM,
      maxOfflineSyncMinutes: settings.maxOfflineSyncMinutes,
      consentVersion: settings.consentVersion,
    };
  }
}

function record(value: Prisma.JsonValue | undefined) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function positiveInteger(
  value: Prisma.JsonValue | undefined,
  min: number,
  max: number,
) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
