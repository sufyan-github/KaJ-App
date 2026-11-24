-- Lesson steps (cards with optional pictures) and lesson checkpoints. Additive:
-- existing lessons get revision 1 and no stored steps (the API derives them
-- from the summary until the content is reloaded).

-- CreateEnum
CREATE TYPE "TrainingStepKind" AS ENUM ('LEARN', 'STEP', 'HAZARD', 'REMEMBER');

-- AlterTable
ALTER TABLE "training_lessons" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "training_questions" ADD COLUMN     "lesson_id" UUID,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "training_lesson_steps" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "lesson_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "kind" "TrainingStepKind" NOT NULL,
    "text_en" TEXT NOT NULL,
    "text_bn" TEXT NOT NULL,
    "image_key" TEXT,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "image_alt_en" TEXT,
    "image_alt_bn" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_lesson_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_lesson_checkpoints" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "course_version" INTEGER NOT NULL,
    "lesson_revision" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "passed_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_lesson_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_lesson_steps_image_key_idx" ON "training_lesson_steps"("image_key");

-- CreateIndex
CREATE UNIQUE INDEX "training_lesson_steps_lesson_id_sort_order_key" ON "training_lesson_steps"("lesson_id", "sort_order");

-- CreateIndex
CREATE INDEX "training_lesson_checkpoints_lesson_id_idx" ON "training_lesson_checkpoints"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_lesson_checkpoints_user_id_lesson_id_key" ON "training_lesson_checkpoints"("user_id", "lesson_id");

-- CreateIndex
CREATE INDEX "training_questions_lesson_id_is_active_idx" ON "training_questions"("lesson_id", "is_active");

-- AddForeignKey
ALTER TABLE "training_questions" ADD CONSTRAINT "training_questions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "training_lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_lesson_steps" ADD CONSTRAINT "training_lesson_steps_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "training_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_lesson_checkpoints" ADD CONSTRAINT "training_lesson_checkpoints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_lesson_checkpoints" ADD CONSTRAINT "training_lesson_checkpoints_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "training_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

