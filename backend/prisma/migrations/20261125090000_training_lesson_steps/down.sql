DROP TABLE IF EXISTS "training_lesson_checkpoints";
DROP TABLE IF EXISTS "training_lesson_steps";
ALTER TABLE "training_questions" DROP CONSTRAINT IF EXISTS "training_questions_lesson_id_fkey";
DROP INDEX IF EXISTS "training_questions_lesson_id_is_active_idx";
ALTER TABLE "training_questions" DROP COLUMN IF EXISTS "lesson_id";
ALTER TABLE "training_questions" DROP COLUMN IF EXISTS "sort_order";
ALTER TABLE "training_lessons" DROP COLUMN IF EXISTS "revision";
DROP TYPE IF EXISTS "TrainingStepKind";
