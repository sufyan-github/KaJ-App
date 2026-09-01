ALTER TABLE "categories"
ADD COLUMN "requires_identity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requires_poster_identity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requires_references" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "requires_licence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "safety_notice" TEXT,
ADD COLUMN "unsafe_for_students" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "config_revisions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "key" TEXT NOT NULL,
    "before_json" JSONB NOT NULL,
    "after_json" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "config_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_campaigns" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "name" TEXT NOT NULL,
    "segment_json" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "throttle_per_minute" INTEGER NOT NULL DEFAULT 100,
    "dry_run_count" INTEGER NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    CONSTRAINT "notification_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "config_revisions_key_created_at_idx" ON "config_revisions"("key", "created_at" DESC);
CREATE INDEX "config_revisions_changed_by_idx" ON "config_revisions"("changed_by");
CREATE INDEX "notification_campaigns_status_created_at_idx" ON "notification_campaigns"("status", "created_at" DESC);
CREATE INDEX "notification_campaigns_created_by_idx" ON "notification_campaigns"("created_by");

ALTER TABLE "config_revisions" ADD CONSTRAINT "config_revisions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_campaigns" ADD CONSTRAINT "notification_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
