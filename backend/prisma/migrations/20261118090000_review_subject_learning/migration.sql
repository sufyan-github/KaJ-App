-- P1 leftover: reviews of a learning enrolment (learner <-> mentor), a new
-- review subject. subject_id = assignment_id of the enrolment; the same
-- double-blind reveal as job reviews. Rollback: down.sql. Enum values can't
-- be removed, so it is added with IF NOT EXISTS and re-applies cleanly.

-- AlterEnum
ALTER TYPE "ReviewSubjectType" ADD VALUE IF NOT EXISTS 'LEARNING_ENROLMENT';
