-- Additive: optional worker training (lessons, knowledge tests, certificates)
-- and a self-reported prior-training flag on worker skills.
CREATE TYPE "EvidenceLevel" AS ENUM ('SELF_REPORTED', 'KNOWLEDGE_TESTED', 'PRACTICAL_CHECKED', 'OFFICIALLY_CERTIFIED');

ALTER TABLE "user_skills" ADD COLUMN "has_prior_training" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "training_courses" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "slug" TEXT NOT NULL,
  "skill_id" UUID,
  "title_en" TEXT NOT NULL,
  "title_bn" TEXT NOT NULL,
  "summary_en" TEXT NOT NULL,
  "summary_bn" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "est_data_mb" INTEGER NOT NULL,
  "pass_mark_pct" INTEGER NOT NULL DEFAULT 70,
  "question_count" INTEGER NOT NULL DEFAULT 10,
  "is_safety_critical" BOOLEAN NOT NULL DEFAULT false,
  "is_published" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_courses_pass_mark_pct_check" CHECK ("pass_mark_pct" BETWEEN 1 AND 100),
  CONSTRAINT "training_courses_question_count_check" CHECK ("question_count" >= 1),
  CONSTRAINT "training_courses_minutes_check" CHECK ("minutes" >= 0),
  CONSTRAINT "training_courses_est_data_mb_check" CHECK ("est_data_mb" >= 0),
  CONSTRAINT "training_courses_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "training_lessons" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "course_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "title_en" TEXT NOT NULL,
  "title_bn" TEXT NOT NULL,
  "summary_en" TEXT NOT NULL,
  "summary_bn" TEXT NOT NULL,
  "youtube_video_id" TEXT,
  "duration_s" INTEGER,
  "is_safety" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "training_lessons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_lessons_duration_s_check" CHECK ("duration_s" IS NULL OR "duration_s" >= 0)
);

CREATE TABLE "training_questions" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "course_id" UUID NOT NULL,
  "prompt_en" TEXT NOT NULL,
  "prompt_bn" TEXT NOT NULL,
  "options_json" JSONB NOT NULL,
  "correct_option_id" TEXT NOT NULL,
  "explanation_en" TEXT NOT NULL,
  "explanation_bn" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "training_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "training_lesson_opens" (
  "user_id" UUID NOT NULL,
  "lesson_id" UUID NOT NULL,
  "first_opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_lesson_opens_pkey" PRIMARY KEY ("user_id", "lesson_id")
);

CREATE TABLE "training_attempts" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "user_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "course_version" INTEGER NOT NULL,
  "question_ids" JSONB NOT NULL,
  "answers_json" JSONB,
  "score_pct" INTEGER,
  "passed" BOOLEAN,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "submitted_at" TIMESTAMP(3),
  CONSTRAINT "training_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_attempts_score_pct_check" CHECK ("score_pct" IS NULL OR "score_pct" BETWEEN 0 AND 100)
);

CREATE TABLE "training_certificates" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "user_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "course_version" INTEGER NOT NULL,
  "evidence_level" "EvidenceLevel" NOT NULL,
  "score_pct" INTEGER NOT NULL,
  "public_code" TEXT NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "training_certificates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_certificates_score_pct_check" CHECK ("score_pct" BETWEEN 0 AND 100),
  CONSTRAINT "training_certificates_public_code_check" CHECK (char_length("public_code") = 10)
);

CREATE UNIQUE INDEX "training_courses_slug_key" ON "training_courses"("slug");
CREATE INDEX "training_courses_skill_id_is_published_idx" ON "training_courses"("skill_id", "is_published");
CREATE UNIQUE INDEX "training_lessons_course_id_sort_order_key" ON "training_lessons"("course_id", "sort_order");
CREATE INDEX "training_questions_course_id_is_active_idx" ON "training_questions"("course_id", "is_active");
CREATE INDEX "training_lesson_opens_lesson_id_idx" ON "training_lesson_opens"("lesson_id");
CREATE INDEX "training_attempts_user_id_course_id_started_at_idx" ON "training_attempts"("user_id", "course_id", "started_at");
CREATE INDEX "training_attempts_course_id_idx" ON "training_attempts"("course_id");
CREATE UNIQUE INDEX "training_certificates_attempt_id_key" ON "training_certificates"("attempt_id");
CREATE UNIQUE INDEX "training_certificates_public_code_key" ON "training_certificates"("public_code");
CREATE INDEX "training_certificates_user_id_revoked_at_idx" ON "training_certificates"("user_id", "revoked_at");
CREATE INDEX "training_certificates_course_id_idx" ON "training_certificates"("course_id");

ALTER TABLE "training_courses" ADD CONSTRAINT "training_courses_skill_id_fkey"
  FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_lessons" ADD CONSTRAINT "training_lessons_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_questions" ADD CONSTRAINT "training_questions_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_lesson_opens" ADD CONSTRAINT "training_lesson_opens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_lesson_opens" ADD CONSTRAINT "training_lesson_opens_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "training_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_attempts" ADD CONSTRAINT "training_attempts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_attempts" ADD CONSTRAINT "training_attempts_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_certificates" ADD CONSTRAINT "training_certificates_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_certificates" ADD CONSTRAINT "training_certificates_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_certificates" ADD CONSTRAINT "training_certificates_attempt_id_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "training_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
