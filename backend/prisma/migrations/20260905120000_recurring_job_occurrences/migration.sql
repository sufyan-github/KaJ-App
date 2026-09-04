CREATE TYPE "JobOccurrenceStatus" AS ENUM (
  'SCHEDULED',
  'ASSIGNED',
  'CONFIRMED',
  'UPCOMING',
  'CHECKED_IN',
  'IN_PROGRESS',
  'SUBMITTED',
  'CUSTOMER_REVIEW',
  'COMPLETED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_WORKER',
  'DECLINED'
);

CREATE TABLE "job_occurrences" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "job_id" UUID NOT NULL,
  "sequence_no" INTEGER NOT NULL,
  "scheduled_date" DATE NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "status" "JobOccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
  "assigned_assignment_id" UUID,
  "cancel_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "job_occurrences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "job_occurrences_time_window_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "job_occurrences_sequence_check" CHECK ("sequence_no" > 0)
);

CREATE UNIQUE INDEX "job_occurrences_job_id_sequence_no_key" ON "job_occurrences"("job_id", "sequence_no");
CREATE UNIQUE INDEX "job_occurrences_job_id_starts_at_key" ON "job_occurrences"("job_id", "starts_at");
CREATE INDEX "job_occurrences_starts_at_status_idx" ON "job_occurrences"("starts_at", "status");
CREATE INDEX "job_occurrences_assigned_assignment_id_starts_at_idx" ON "job_occurrences"("assigned_assignment_id", "starts_at");

ALTER TABLE "job_occurrences" ADD CONSTRAINT "job_occurrences_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_occurrences" ADD CONSTRAINT "job_occurrences_assigned_assignment_id_fkey"
  FOREIGN KEY ("assigned_assignment_id") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
