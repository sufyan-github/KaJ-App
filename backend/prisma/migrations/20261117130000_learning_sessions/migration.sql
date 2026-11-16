-- P1.3 progress of a learning enrolment: one row per taught session.
-- New table only. Rollback: down.sql.

-- CreateTable
CREATE TABLE "learning_sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "assignment_id" UUID NOT NULL,
    "held_at" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "notes" TEXT,
    "recorded_by_user_id" UUID NOT NULL,
    "learner_confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_sessions_assignment_id_held_at_idx" ON "learning_sessions"("assignment_id", "held_at");

-- CreateIndex
CREATE INDEX "learning_sessions_recorded_by_user_id_idx" ON "learning_sessions"("recorded_by_user_id");

-- AddForeignKey
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_minutes_check"
  CHECK ("minutes" BETWEEN 1 AND 1440);
