ALTER TABLE "conversations"
  ADD COLUMN "scope_key" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deleted_at" TIMESTAMP(3);

UPDATE "conversations"
SET "scope_key" = 'legacy:' || "id"::text
WHERE "scope_key" IS NULL;

ALTER TABLE "conversations" ALTER COLUMN "scope_key" SET NOT NULL;
CREATE UNIQUE INDEX "conversations_scope_key_key" ON "conversations"("scope_key");

ALTER TABLE "messages"
  ADD COLUMN "client_nonce" UUID,
  ADD COLUMN "safety_warning" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "messages_client_nonce_key" ON "messages"("client_nonce");

CREATE TABLE "user_blocks" (
  "blocker_user_id" UUID NOT NULL,
  "blocked_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_user_id", "blocked_user_id"),
  CONSTRAINT "user_blocks_blocker_user_id_fkey" FOREIGN KEY ("blocker_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_blocks_blocked_user_id_fkey" FOREIGN KEY ("blocked_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_blocks_blocked_user_id_idx" ON "user_blocks"("blocked_user_id");
