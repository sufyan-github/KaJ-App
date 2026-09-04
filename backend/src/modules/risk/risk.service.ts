import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JobStatus, Prisma, RiskReviewStatus } from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import { RiskDecisionDto, RiskQueueQueryDto } from "./dto/risk.dto";
import {
  detectApplicationSpam,
  detectIdentityClusters,
  detectPriceAnomalies,
  detectReviewRings,
  detectTravelRisk,
  mergeSignals,
  severityForScore,
  totalRiskScore,
} from "./risk.rules";

const ACTIVE_RISK_STATUSES: RiskReviewStatus[] = [
  RiskReviewStatus.OPEN,
  RiskReviewStatus.UNDER_REVIEW,
];

@Injectable()
export class RiskService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async scan(
    reason: string,
    actor: AdminActor | null,
    context: AdminRequestContext,
  ) {
    const now = this.clock.now();
    const dayAgo = before(now, 1);
    const weekAgo = before(now, 7);
    const monthAgo = before(now, 30);
    const quarterAgo = before(now, 90);
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(1262565205)::text AS locked
        `;
        const [observations, workSessions, applications, reviews, jobs] =
          await Promise.all([
            transaction.riskIdentityObservation.findMany({
              where: { last_observed_at: { gte: monthAgo } },
            }),
            transaction.workSession.findMany({
              where: { checkin_at: { gte: weekAgo } },
              select: {
                id: true,
                checkin_at: true,
                checkin_lat: true,
                checkin_lng: true,
                checkin_mock_location: true,
                assignment: { select: { worker_user_id: true } },
              },
            }),
            transaction.application.findMany({
              where: { created_at: { gte: dayAgo } },
              select: { id: true, worker_user_id: true, created_at: true },
            }),
            transaction.review.findMany({
              where: { created_at: { gte: monthAgo }, is_visible: true },
              select: {
                assignment_id: true,
                reviewer_user_id: true,
                reviewee_user_id: true,
                rating: true,
                created_at: true,
              },
            }),
            transaction.job.findMany({
              where: {
                budget_max_poisha: { not: null },
                created_at: { gte: quarterAgo },
                deleted_at: null,
                status: { not: JobStatus.DRAFT },
              },
              select: {
                id: true,
                poster_user_id: true,
                category_id: true,
                payment_model: true,
                budget_max_poisha: true,
                created_at: true,
              },
            }),
          ]);

        const signals = mergeSignals(
          detectIdentityClusters(
            observations.map((item) => ({
              kind: item.kind,
              lastObservedAt: item.last_observed_at,
              userId: item.user_id,
              valueHash: item.value_hash,
            })),
          ),
          detectTravelRisk(
            workSessions.flatMap((item) =>
              item.checkin_at && item.checkin_lat && item.checkin_lng
                ? [
                    {
                      at: item.checkin_at,
                      eventId: item.id,
                      lat: Number(item.checkin_lat),
                      lng: Number(item.checkin_lng),
                      mockLocation: item.checkin_mock_location,
                      userId: item.assignment.worker_user_id,
                    },
                  ]
                : [],
            ),
          ),
          detectApplicationSpam(
            applications.map((item) => ({
              at: item.created_at,
              id: item.id,
              userId: item.worker_user_id,
            })),
            now,
          ),
          detectReviewRings(
            reviews.map((item) => ({
              assignmentId: item.assignment_id,
              at: item.created_at,
              rating: item.rating,
              revieweeUserId: item.reviewee_user_id,
              reviewerUserId: item.reviewer_user_id,
            })),
          ),
          detectPriceAnomalies(
            jobs.map((item) => ({
              amountPoisha: item.budget_max_poisha!,
              at: item.created_at,
              groupKey: `${item.category_id}:${item.payment_model}`,
              jobId: item.id,
              userId: item.poster_user_id,
            })),
            weekAgo,
          ),
        );

        let created = 0;
        let refreshed = 0;
        for (const [subjectUserId, subjectSignals] of signals) {
          const score = totalRiskScore(subjectSignals);
          const active = await transaction.riskReviewItem.findFirst({
            where: {
              subject_user_id: subjectUserId,
              status: { in: ACTIVE_RISK_STATUSES },
            },
            orderBy: { created_at: "desc" },
          });
          const data = {
            score,
            severity: severityForScore(score),
            signals_json: subjectSignals as unknown as Prisma.InputJsonValue,
            window_started_at: quarterAgo,
            window_ended_at: now,
            last_detected_at: now,
          };
          if (active) {
            await transaction.riskReviewItem.update({
              where: { id: active.id },
              data,
            });
            refreshed += 1;
          } else {
            await transaction.riskReviewItem.create({
              data: {
                ...data,
                subject_user_id: subjectUserId,
                entity_id: subjectUserId,
              },
            });
            created += 1;
          }
        }
        await transaction.auditLog.create({
          data: this.auditData(
            actor,
            "ADMIN_RISK_SCAN_RUN",
            "RISK_REVIEW",
            null,
            {
              created,
              detectedAccounts: signals.size,
              reason: reason.trim(),
              refreshed,
              automaticActions: 0,
            },
            context,
          ),
        });
        return {
          automaticActions: 0,
          created,
          detectedAccounts: signals.size,
          refreshed,
          scannedAt: now,
        };
      },
      { maxWait: 5_000, timeout: 30_000 },
    );
  }

  async queue(
    query: RiskQueueQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const where: Prisma.RiskReviewItemWhereInput = {
      score: { gte: query.minScore },
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total, grouped] = await Promise.all([
      this.prisma.riskReviewItem.findMany({
        where,
        orderBy: [{ score: "desc" }, { created_at: "asc" }],
        take: query.limit,
        include: {
          subject: { include: { profile: true } },
          reviewer: { include: { profile: true } },
        },
      }),
      this.prisma.riskReviewItem.count({ where }),
      this.prisma.riskReviewItem.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);
    await this.prisma.auditLog.create({
      data: this.auditData(
        actor,
        "ADMIN_RISK_QUEUE_VIEWED",
        "RISK_REVIEW",
        null,
        {
          limit: query.limit,
          minScore: query.minScore,
          status: query.status ?? null,
        },
        context,
      ),
    });
    const counts = Object.fromEntries(
      grouped.map((item) => [item.status, item._count._all]),
    ) as Partial<Record<RiskReviewStatus, number>>;
    const decided = (counts.CLEARED ?? 0) + (counts.ESCALATED ?? 0);
    return {
      total,
      metrics: {
        adjudicatedCount: decided,
        observedFalsePositiveRateBps:
          decided === 0
            ? null
            : Math.round(((counts.CLEARED ?? 0) / decided) * 10_000),
        observedPrecisionBps:
          decided === 0
            ? null
            : Math.round(((counts.ESCALATED ?? 0) / decided) * 10_000),
      },
      items: items.map((item) => ({
        id: item.id,
        score: item.score,
        severity: item.severity,
        signals: item.signals_json,
        status: item.status,
        windowStartedAt: item.window_started_at,
        windowEndedAt: item.window_ended_at,
        lastDetectedAt: item.last_detected_at,
        resolution: item.resolution,
        reviewedAt: item.reviewed_at,
        subject: {
          id: item.subject.id,
          name: item.subject.profile?.display_name ?? "Profile incomplete",
          status: item.subject.status,
          moderationLevel: item.subject.moderation_level,
        },
        reviewer: item.reviewer
          ? {
              id: item.reviewer.id,
              name: item.reviewer.profile?.display_name ?? "Admin",
            }
          : null,
      })),
    };
  }

  async startReview(
    id: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const item = await this.prisma.riskReviewItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    if (item.status !== RiskReviewStatus.OPEN) {
      throw new ConflictException("Only open risk items can enter review.");
    }
    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.riskReviewItem.updateMany({
        where: { id, status: RiskReviewStatus.OPEN },
        data: {
          status: RiskReviewStatus.UNDER_REVIEW,
          reviewer_user_id: actor.userId,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Only open risk items can enter review.");
      }
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_RISK_REVIEW_STARTED",
          "RISK_REVIEW",
          id,
          { status: RiskReviewStatus.UNDER_REVIEW },
          context,
        ),
      });
    });
    return { id, status: RiskReviewStatus.UNDER_REVIEW };
  }

  async decide(
    id: string,
    input: RiskDecisionDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    if (
      input.status !== RiskReviewStatus.CLEARED &&
      input.status !== RiskReviewStatus.ESCALATED
    ) {
      throw new BadRequestException(
        "A risk decision must be cleared or escalated.",
      );
    }
    const item = await this.prisma.riskReviewItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    if (!ACTIVE_RISK_STATUSES.includes(item.status)) {
      throw new ConflictException("This risk item already has a decision.");
    }
    const now = this.clock.now();
    await this.prisma.$transaction(async (transaction) => {
      const decided = await transaction.riskReviewItem.updateMany({
        where: { id, status: { in: ACTIVE_RISK_STATUSES } },
        data: {
          status: input.status,
          reviewer_user_id: actor.userId,
          resolution: input.reason.trim(),
          reviewed_at: now,
        },
      });
      if (decided.count !== 1) {
        throw new ConflictException("This risk item already has a decision.");
      }
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_RISK_DECIDED",
          "RISK_REVIEW",
          id,
          { reason: input.reason.trim(), status: input.status },
          context,
        ),
      });
    });
    return {
      id,
      status: input.status,
      automaticModerationAction: null,
    };
  }

  private auditData(
    actor: AdminActor | null,
    action: string,
    entity: string,
    entityId: string | null,
    after: Prisma.InputJsonValue,
    context: AdminRequestContext,
  ): Prisma.AuditLogUncheckedCreateInput {
    return {
      actor_user_id: actor?.userId ?? null,
      action,
      entity,
      entity_id: entityId,
      before_json: Prisma.JsonNull,
      after_json: after,
      ip: context.ip,
      ua: context.ua,
    };
  }
}

function before(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
