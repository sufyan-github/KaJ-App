import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AssignmentStatus,
  JobActorType,
  JobStatus,
  Prisma,
  ReviewDirection,
} from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { JobStateMachine } from "../jobs/state-machine/job-state.machine";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { eligibleBadgeSlugs } from "./badge.rules";
import { rateBps, rawRating, workerReliability } from "./reputation.calculator";

const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60_000;

@Injectable()
export class ReviewsService {
  private readonly states = new JobStateMachine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(userId: string, assignmentId: string, input: CreateReviewDto) {
    const assignment = await this.participantAssignment(userId, assignmentId);
    this.assertReviewable(assignment);
    const isCustomer = assignment.job.poster_user_id === userId;
    const revieweeUserId = isCustomer
      ? assignment.worker_user_id
      : assignment.job.poster_user_id;

    const result = await this.prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.review.findUnique({
        where: {
          assignment_id_reviewer_user_id: {
            assignment_id: assignmentId,
            reviewer_user_id: userId,
          },
        },
      });
      if (duplicate) throw new ConflictException("Review already submitted.");

      const review = await transaction.review.create({
        data: {
          assignment_id: assignmentId,
          job_id: assignment.job_id,
          reviewer_user_id: userId,
          reviewee_user_id: revieweeUserId,
          direction: isCustomer ? ReviewDirection.C2W : ReviewDirection.W2C,
          rating: input.rating,
          punctuality: input.punctuality,
          quality: input.quality,
          communication: input.communication,
          reliability: input.reliability,
          comment: input.comment?.trim() || null,
        },
      });
      const pairCount = await transaction.review.count({
        where: { assignment_id: assignmentId, is_visible: true },
      });
      if (pairCount === 2) {
        await this.recomputeProfiles(transaction, [
          assignment.worker_user_id,
          assignment.job.poster_user_id,
        ]);
        if (
          assignment.job.status === JobStatus.PAYMENT_RELEASED ||
          assignment.job.status === JobStatus.PAYMENT_RECORDED
        ) {
          await this.states.transitionInTransaction(
            transaction,
            assignment.job,
            JobStatus.REVIEWED,
            { type: JobActorType.SYSTEM },
            "Both participants submitted reviews",
          );
        }
      }
      return { review, revealed: pairCount === 2 };
    });

    await this.notifications.create({
      userId: revieweeUserId,
      type: "REVIEW_RECEIVED",
      title: "নতুন রিভিউ",
      body: result.revealed
        ? "দুজনের রিভিউ এখন দেখা যাচ্ছে।"
        : "রিভিউ জমা হয়েছে। আপনার রিভিউ দেওয়ার পর এটি দেখা যাবে।",
      payload: { assignmentId, route: "/reviews" },
      dedupeKey: `review:${result.review.id}`,
    });
    return { submitted: true, revealed: result.revealed };
  }

  async forAssignment(userId: string, assignmentId: string) {
    const assignment = await this.participantAssignment(userId, assignmentId);
    const reviews = await this.prisma.review.findMany({
      where: { assignment_id: assignmentId, is_visible: true },
      include: { reviewer: { include: { profile: true } } },
      orderBy: { created_at: "asc" },
    });
    const windowEndsAt = this.windowEndsAt(assignment.job.completed_at);
    const revealed = reviews.length === 2 || this.clock.now() >= windowEndsAt;
    const own = reviews.find((review) => review.reviewer_user_id === userId);
    const counterpart = reviews.find(
      (review) => review.reviewer_user_id !== userId,
    );
    return {
      canReview:
        !own &&
        assignment.status === AssignmentStatus.COMPLETED &&
        this.clock.now() <= windowEndsAt,
      revealed,
      windowEndsAt: windowEndsAt.toISOString(),
      myReview: own ? serializeReview(own) : null,
      receivedReview:
        revealed && counterpart ? serializeReview(counterpart) : null,
    };
  }

  async received(userId: string) {
    const rows = await this.prisma.review.findMany({
      where: { reviewee_user_id: userId, is_visible: true },
      include: {
        reviewer: { include: { profile: true } },
        assignment: { include: { job: true, reviews: true } },
      },
      orderBy: { created_at: "desc" },
    });
    const now = this.clock.now();
    return {
      items: rows
        .filter(
          (row) =>
            row.assignment.reviews.filter((review) => review.is_visible)
              .length === 2 ||
            now >= this.windowEndsAt(row.assignment.job.completed_at),
        )
        .map(serializeReview),
    };
  }

  async reputation(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        worker_profile: true,
        customer_profile: true,
        badges: {
          where: { revoked_at: null },
          include: { badge: true },
          orderBy: { granted_at: "asc" },
        },
      },
    });
    if (!user) throw new NotFoundException();
    return {
      ratingAverage:
        user.worker_profile?.rating_avg.toString() ??
        user.customer_profile?.rating_avg.toString() ??
        "0",
      ratingCount:
        user.worker_profile?.rating_count ??
        user.customer_profile?.rating_count ??
        0,
      completedJobs: user.worker_profile?.completed_jobs_count ?? 0,
      completionRatePercent: user.worker_profile
        ? Math.round(user.worker_profile.completion_rate_bps / 100)
        : null,
      explanation: user.worker_profile
        ? "সম্পন্ন কাজ, বাতিলের হার এবং প্রকাশিত দুই-পক্ষের রিভিউ থেকে হিসাব করা হয়েছে।"
        : "প্রকাশিত দুই-পক্ষের রিভিউ থেকে হিসাব করা হয়েছে।",
      badges: user.badges.map(({ badge }) => ({
        slug: badge.slug,
        nameEn: badge.name_en,
        nameBn: badge.name_bn,
        icon: badge.icon,
      })),
    };
  }

  async recomputeAllReputation() {
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { worker_profile: { isNot: null } },
          { customer_profile: { isNot: null } },
        ],
      },
      select: { id: true },
    });
    await this.prisma.$transaction((transaction) =>
      this.recomputeProfiles(
        transaction,
        users.map((user) => user.id),
      ),
    );
    await this.reconcileBadges();
    return { refreshedUsers: users.length };
  }

  private async recomputeProfiles(
    transaction: Prisma.TransactionClient,
    userIds: readonly string[],
  ) {
    for (const userId of userIds) {
      const user = await transaction.user.findUniqueOrThrow({
        where: { id: userId },
        include: { worker_profile: true, customer_profile: true },
      });
      if (user.worker_profile) {
        const ratings = await this.pairedRatings(
          transaction,
          userId,
          ReviewDirection.C2W,
        );
        const completed = await transaction.assignment.count({
          where: { worker_user_id: userId, status: AssignmentStatus.COMPLETED },
        });
        const cancelled = await transaction.assignment.count({
          where: { worker_user_id: userId, status: AssignmentStatus.CANCELLED },
        });
        const facts = {
          completedJobs: completed,
          cancelledJobs: cancelled,
          noShows: user.worker_profile.no_show_count,
          rawRating: rawRating(ratings),
          ratingCount: ratings.length,
        };
        const total = completed + cancelled + facts.noShows;
        await transaction.workerProfile.update({
          where: { user_id: userId },
          data: {
            completed_jobs_count: completed,
            rating_avg: facts.rawRating,
            rating_count: facts.ratingCount,
            completion_rate_bps: rateBps(completed, total),
            cancellation_rate_bps: rateBps(cancelled, total),
            reliability_score: workerReliability(facts),
          },
        });
      }
      if (user.customer_profile) {
        const ratings = await this.pairedRatings(
          transaction,
          userId,
          ReviewDirection.W2C,
        );
        await transaction.customerProfile.update({
          where: { user_id: userId },
          data: {
            rating_avg: rawRating(ratings),
            rating_count: ratings.length,
          },
        });
      }
    }
  }

  private async reconcileBadges() {
    const users = await this.prisma.user.findMany({
      where: { worker_profile: { isNot: null } },
      include: { profile: true, worker_profile: true, badges: true },
    });
    const badges = await this.prisma.badge.findMany();
    const badgeBySlug = new Map(badges.map((badge) => [badge.slug, badge]));
    for (const user of users) {
      if (!user.worker_profile) continue;
      const eligible = new Set(
        eligibleBadgeSlugs({
          isVerified: user.profile?.trust_level !== "NONE",
          completedJobs: user.worker_profile.completed_jobs_count,
          ratingAverage: user.worker_profile.rating_avg.toNumber(),
          ratingCount: user.worker_profile.rating_count,
          completionRateBps: user.worker_profile.completion_rate_bps,
        }),
      );
      for (const [slug, badge] of badgeBySlug) {
        const current = user.badges.find((item) => item.badge_id === badge.id);
        const shouldHave = eligible.has(slug);
        if (shouldHave && current?.revoked_at) {
          await this.prisma.userBadge.update({
            where: {
              user_id_badge_id: { user_id: user.id, badge_id: badge.id },
            },
            data: { granted_at: this.clock.now(), revoked_at: null },
          });
          await this.auditBadge(user.id, badge.id, "BADGE_GRANTED");
        } else if (shouldHave && !current) {
          await this.prisma.userBadge.create({
            data: { user_id: user.id, badge_id: badge.id },
          });
          await this.auditBadge(user.id, badge.id, "BADGE_GRANTED");
        } else if (!shouldHave && current && !current.revoked_at) {
          await this.prisma.userBadge.update({
            where: {
              user_id_badge_id: { user_id: user.id, badge_id: badge.id },
            },
            data: { revoked_at: this.clock.now() },
          });
          await this.auditBadge(user.id, badge.id, "BADGE_REVOKED");
        }
      }
    }
  }

  private auditBadge(userId: string, badgeId: string, action: string) {
    return this.prisma.auditLog.create({
      data: {
        action,
        entity: "UserBadge",
        entity_id: badgeId,
        after_json: { userId, badgeId },
      },
    });
  }

  private async pairedRatings(
    transaction: Prisma.TransactionClient,
    userId: string,
    direction: ReviewDirection,
  ) {
    const reviews = await transaction.review.findMany({
      where: {
        reviewee_user_id: userId,
        direction,
        is_visible: true,
        assignment: {
          reviews: {
            some: { direction: opposite(direction), is_visible: true },
          },
        },
      },
      select: { rating: true },
    });
    return reviews.map((review) => review.rating);
  }

  private participantAssignment(userId: string, assignmentId: string) {
    return this.prisma.assignment.findFirstOrThrow({
      where: {
        id: assignmentId,
        OR: [{ worker_user_id: userId }, { job: { poster_user_id: userId } }],
      },
      include: { job: true },
    });
  }

  private assertReviewable(
    assignment: Awaited<ReturnType<ReviewsService["participantAssignment"]>>,
  ) {
    if (assignment.status !== AssignmentStatus.COMPLETED) {
      throw new ConflictException(
        "Reviews unlock after assignment completion.",
      );
    }
    if (this.clock.now() > this.windowEndsAt(assignment.job.completed_at)) {
      throw new ConflictException("The seven-day review window has closed.");
    }
  }

  private windowEndsAt(completedAt: Date | null): Date {
    if (!completedAt)
      throw new ConflictException("Completion time is missing.");
    return new Date(completedAt.getTime() + REVIEW_WINDOW_MS);
  }
}

function opposite(direction: ReviewDirection): ReviewDirection {
  return direction === ReviewDirection.C2W
    ? ReviewDirection.W2C
    : ReviewDirection.C2W;
}

function serializeReview(review: {
  id: string;
  assignment_id: string;
  reviewer_user_id: string;
  direction: ReviewDirection;
  rating: number;
  punctuality: number | null;
  quality: number | null;
  communication: number | null;
  reliability: number | null;
  comment: string | null;
  created_at: Date;
  reviewer: { profile: { display_name: string } | null };
}) {
  return {
    id: review.id,
    assignmentId: review.assignment_id,
    reviewerUserId: review.reviewer_user_id,
    reviewerName: review.reviewer.profile?.display_name || "KAAJ ব্যবহারকারী",
    direction: review.direction,
    rating: review.rating,
    punctuality: review.punctuality,
    quality: review.quality,
    communication: review.communication,
    reliability: review.reliability,
    comment: review.comment,
    createdAt: review.created_at.toISOString(),
  };
}
