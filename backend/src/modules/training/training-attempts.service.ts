import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { EvidenceLevel, Prisma } from "@prisma/client";

import { CLOCK, type Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { TrainingCheckpointsService } from "./training-checkpoints.service";
import {
  certificateInclude,
  serializeCertificate,
} from "./training-certificates.service";
import {
  trainingAlreadyCertifiedError,
  trainingAnswerInvalidError,
  trainingAttemptExpiredError,
  trainingAttemptLimitError,
  trainingAttemptSubmittedError,
  trainingUnavailableError,
  testLockedError,
} from "./training.errors";
import {
  ATTEMPT_DURATION_MS,
  attemptAllowance,
  FAILED_ATTEMPT_WINDOW_MS,
  generateUniqueCertificateCode,
  gradeAttempt,
  parseOptions,
  parseQuestionIds,
  sampleQuestionIds,
  shuffleOptionsForAttempt,
  TrainingAnswerError,
  type GradableQuestion,
  type SubmittedAnswer,
} from "./training.rules";

@Injectable()
export class TrainingAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly checkpoints: TrainingCheckpointsService,
    @Optional() @Inject(CLOCK) private readonly clock?: Clock,
  ) {}

  private now() {
    return this.clock?.now() ?? new Date();
  }

  async start(userId: string, courseId: string) {
    const now = this.now();
    const course = await this.prisma.trainingCourse.findFirst({
      where: { id: courseId, is_published: true },
      select: {
        id: true,
        version: true,
        question_count: true,
        is_safety_critical: true,
      },
    });
    if (!course) throw new NotFoundException();
    // Locked order: every lesson's checkpoint before the final test.
    if (
      course.is_safety_critical &&
      (await this.checkpoints.progress(userId, course)).testLocked
    )
      throw testLockedError();

    const [certificate, open, failures] = await Promise.all([
      this.prisma.trainingCertificate.findFirst({
        where: {
          user_id: userId,
          course_id: course.id,
          course_version: course.version,
          revoked_at: null,
        },
        select: { id: true },
      }),
      this.prisma.trainingAttempt.findFirst({
        where: {
          user_id: userId,
          course_id: course.id,
          course_version: course.version,
          submitted_at: null,
          expires_at: { gt: now },
        },
        orderBy: { started_at: "desc" },
      }),
      this.prisma.trainingAttempt.findMany({
        where: {
          user_id: userId,
          course_id: course.id,
          passed: false,
          submitted_at: {
            gt: new Date(now.getTime() - FAILED_ATTEMPT_WINDOW_MS),
          },
        },
        select: { submitted_at: true },
      }),
    ]);
    if (certificate) throw trainingAlreadyCertifiedError();
    if (open) return this.presentAttempt(open);

    const allowance = attemptAllowance(
      failures.map((failure) => failure.submitted_at!),
      now,
    );
    if (allowance.nextAttemptAt) {
      throw trainingAttemptLimitError(allowance.nextAttemptAt);
    }

    const bank = await this.prisma.trainingQuestion.findMany({
      where: { course_id: course.id, is_active: true },
      select: { id: true },
    });
    if (bank.length === 0) throw trainingUnavailableError();
    const questionIds = sampleQuestionIds(
      bank.map((question) => question.id),
      course.question_count,
    );
    const attempt = await this.prisma.trainingAttempt.create({
      data: {
        user_id: userId,
        course_id: course.id,
        course_version: course.version,
        question_ids: questionIds,
        started_at: now,
        expires_at: new Date(now.getTime() + ATTEMPT_DURATION_MS),
      },
    });
    return this.presentAttempt(attempt);
  }

  async submit(userId: string, attemptId: string, answers: SubmittedAnswer[]) {
    const now = this.now();
    const attempt = await this.prisma.trainingAttempt.findFirst({
      where: { id: attemptId, user_id: userId },
      include: {
        course: {
          select: {
            id: true,
            title_en: true,
            title_bn: true,
            version: true,
            pass_mark_pct: true,
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException();
    if (attempt.submitted_at) throw trainingAttemptSubmittedError();
    // A content update replaces the question bank, so an older attempt closes.
    if (
      attempt.expires_at <= now ||
      attempt.course_version !== attempt.course.version
    ) {
      throw trainingAttemptExpiredError();
    }

    const served = await this.servedQuestions(attempt.question_ids);
    let graded: ReturnType<typeof gradeAttempt>;
    try {
      graded = gradeAttempt(served, answers, attempt.course.pass_mark_pct);
    } catch (error) {
      if (error instanceof TrainingAnswerError) {
        throw trainingAnswerInvalidError(error.message);
      }
      throw error;
    }

    const certificate = await this.prisma.$transaction(async (transaction) => {
      const closed = await transaction.trainingAttempt.updateMany({
        where: { id: attempt.id, submitted_at: null },
        data: {
          answers_json: answers.map((answer) => ({ ...answer })),
          score_pct: graded.scorePct,
          passed: graded.passed,
          submitted_at: now,
        },
      });
      if (closed.count !== 1) throw trainingAttemptSubmittedError();
      if (!graded.passed) return null;

      const existing = await transaction.trainingCertificate.findFirst({
        where: {
          user_id: userId,
          course_id: attempt.course_id,
          course_version: attempt.course_version,
          revoked_at: null,
        },
        include: certificateInclude,
      });
      if (existing) return existing;

      const code = await generateUniqueCertificateCode(
        async (candidate) =>
          (await transaction.trainingCertificate.count({
            where: { public_code: candidate },
          })) > 0,
      );
      const issued = await transaction.trainingCertificate.create({
        data: {
          user_id: userId,
          course_id: attempt.course_id,
          attempt_id: attempt.id,
          course_version: attempt.course_version,
          evidence_level: EvidenceLevel.KNOWLEDGE_TESTED,
          score_pct: graded.scorePct,
          public_code: code,
          issued_at: now,
        },
        include: certificateInclude,
      });
      await this.notifications.create(
        {
          userId,
          type: "TRAINING_CERTIFICATE_ISSUED",
          title: "পরীক্ষায় পাস করেছেন",
          body: `আপনি ${attempt.course.title_bn} কোর্সের Kaaj জ্ঞান পরীক্ষায় পাস করেছেন।`,
          payload: {
            route: "/training/certificates",
            certificateId: issued.id,
            courseId: attempt.course_id,
          },
          dedupeKey: `training-certificate:${issued.id}`,
        },
        transaction,
      );
      return issued;
    });

    return {
      scorePct: graded.scorePct,
      passed: graded.passed,
      passMarkPct: attempt.course.pass_mark_pct,
      results: graded.results,
      certificate: certificate ? serializeCertificate(certificate) : null,
    };
  }

  private async servedQuestions(
    questionIdsJson: Prisma.JsonValue,
  ): Promise<Array<GradableQuestion & { promptEn: string; promptBn: string }>> {
    const ids = parseQuestionIds(questionIdsJson);
    const rows = await this.prisma.trainingQuestion.findMany({
      where: { id: { in: ids } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row
        ? [
            {
              id: row.id,
              promptEn: row.prompt_en,
              promptBn: row.prompt_bn,
              options: parseOptions(row.options_json),
              correctOptionId: row.correct_option_id,
              explanationEn: row.explanation_en,
              explanationBn: row.explanation_bn,
            },
          ]
        : [];
    });
  }

  /** Never includes the correct answer or explanations. */
  private async presentAttempt(attempt: {
    id: string;
    expires_at: Date;
    question_ids: Prisma.JsonValue;
  }) {
    const questions = await this.servedQuestions(attempt.question_ids);
    return {
      attemptId: attempt.id,
      expiresAt: attempt.expires_at.toISOString(),
      questions: questions.map((question) => ({
        id: question.id,
        promptEn: question.promptEn,
        promptBn: question.promptBn,
        options: shuffleOptionsForAttempt(
          question.options,
          attempt.id,
          question.id,
        ).map((option) => ({ id: option.id, en: option.en, bn: option.bn })),
      })),
    };
  }
}
