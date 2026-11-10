-- Additive: record who cancelled an assignment and whether the cancellation
-- policy penalised it, so customer and emergency cancellations stop lowering
-- a worker's completion rate.
ALTER TABLE "assignments" ADD COLUMN "cancelled_by_user_id" UUID;
ALTER TABLE "assignments" ADD COLUMN "cancellation_penalised" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing cancellations from the cancellation audit entries, which
-- record the actor and the policy preview (reliabilityDelta is 0 for
-- customer, emergency and early cancellations).
UPDATE "assignments" AS a
SET
  "cancelled_by_user_id" = l."actor_user_id",
  "cancellation_penalised" =
    l."actor_user_id" = a."worker_user_id"
    AND COALESCE((l."after_json" ->> 'reliabilityDelta')::numeric, 0) <> 0
FROM (
  SELECT DISTINCT ON ("entity_id") "entity_id", "actor_user_id", "after_json"
  FROM "audit_logs"
  WHERE "entity" = 'Assignment'
    AND "action" IN ('ASSIGNMENT_CANCELLED', 'CANCELLATION_STRIKE')
  ORDER BY "entity_id", "created_at" DESC
) AS l
WHERE a."id" = l."entity_id"
  AND a."status" = 'CANCELLED';
