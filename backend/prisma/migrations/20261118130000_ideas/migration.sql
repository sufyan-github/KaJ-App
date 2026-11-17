-- P2.7–P2.9: ideas (plan migration 10). business_ideas are private by
-- default with a one-line public summary; idea_access records who the owner
-- let see the private details (confidentiality accepted, approver stamped,
-- revocable); idea_detail_views logs every such view; idea_roles are the
-- roles sought (skills, time, arrangement); idea_members is the team
-- "agreed in principle". collaboration_requests.idea_role_id gets its FK.
-- Report targets IDEA and IDEA_ROLE need no change here (reports.target_type
-- is text, validated by the API). Rollback: down.sql.

-- CreateEnum
CREATE TYPE "IdeaStage" AS ENUM ('CONCEPT', 'VALIDATING', 'PILOT', 'CONVERTED');

-- CreateEnum
CREATE TYPE "IdeaVisibility" AS ENUM ('PRIVATE', 'SUMMARY_PUBLIC', 'MEMBERS');

-- CreateEnum
CREATE TYPE "IdeaAccessStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "IdeaRoleType" AS ENUM ('CO_FOUNDER', 'TECHNICAL', 'MARKETING', 'OPERATIONS', 'INDUSTRY_EXPERT', 'MENTOR', 'SUPPLIER', 'DISTRIBUTION', 'PRODUCTION', 'RESEARCH');

-- CreateEnum
CREATE TYPE "IdeaTimeCommitment" AS ENUM ('FEW_HOURS_A_WEEK', 'PART_TIME', 'FULL_TIME', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "IdeaArrangement" AS ENUM ('PAID', 'EQUITY_TO_DISCUSS', 'VOLUNTEER', 'UNDECIDED');

-- CreateEnum
CREATE TYPE "IdeaRoleStatus" AS ENUM ('OPEN', 'FILLED', 'CLOSED');

-- CreateTable
CREATE TABLE "business_ideas" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "owner_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "details" TEXT,
    "category_id" UUID NOT NULL,
    "location_id" UUID,
    "stage" "IdeaStage" NOT NULL DEFAULT 'CONCEPT',
    "visibility" "IdeaVisibility" NOT NULL DEFAULT 'PRIVATE',
    "ai_consent" BOOLEAN NOT NULL DEFAULT false,
    "converted_business_id" UUID,
    "converted_at" TIMESTAMP(3),
    "hidden_at" TIMESTAMP(3),
    "hidden_reason" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_roles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "idea_id" UUID NOT NULL,
    "role_type" "IdeaRoleType" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "time_commitment" "IdeaTimeCommitment" NOT NULL,
    "arrangement" "IdeaArrangement" NOT NULL DEFAULT 'UNDECIDED',
    "status" "IdeaRoleStatus" NOT NULL DEFAULT 'OPEN',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "hidden_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idea_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_role_skills" (
    "role_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,

    CONSTRAINT "idea_role_skills_pkey" PRIMARY KEY ("role_id","skill_id")
);

-- CreateTable
CREATE TABLE "idea_access" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "idea_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "IdeaAccessStatus" NOT NULL DEFAULT 'REQUESTED',
    "message" TEXT,
    "confidentiality_accepted_at" TIMESTAMP(3) NOT NULL,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idea_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_detail_views" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "idea_id" UUID NOT NULL,
    "viewer_user_id" UUID NOT NULL,
    "basis" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idea_detail_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_members" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "idea_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID,
    "role_label" TEXT,
    "collaboration_request_id" UUID,
    "agreed_in_principle_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idea_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_ideas_converted_business_id_key" ON "business_ideas"("converted_business_id");

-- CreateIndex
CREATE INDEX "business_ideas_owner_user_id_idx" ON "business_ideas"("owner_user_id");

-- CreateIndex
CREATE INDEX "business_ideas_visibility_stage_category_id_location_id_idx" ON "business_ideas"("visibility", "stage", "category_id", "location_id");

-- CreateIndex
CREATE INDEX "business_ideas_category_id_idx" ON "business_ideas"("category_id");

-- CreateIndex
CREATE INDEX "business_ideas_location_id_idx" ON "business_ideas"("location_id");

-- CreateIndex
CREATE INDEX "idea_roles_idea_id_status_idx" ON "idea_roles"("idea_id", "status");

-- CreateIndex
CREATE INDEX "idea_role_skills_skill_id_idx" ON "idea_role_skills"("skill_id");

-- CreateIndex
CREATE INDEX "idea_access_user_id_status_idx" ON "idea_access"("user_id", "status");

-- CreateIndex
CREATE INDEX "idea_access_approved_by_user_id_idx" ON "idea_access"("approved_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "idea_access_idea_id_user_id_key" ON "idea_access"("idea_id", "user_id");

-- CreateIndex
CREATE INDEX "idea_detail_views_idea_id_viewed_at_idx" ON "idea_detail_views"("idea_id", "viewed_at" DESC);

-- CreateIndex
CREATE INDEX "idea_detail_views_viewer_user_id_idx" ON "idea_detail_views"("viewer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "idea_members_collaboration_request_id_key" ON "idea_members"("collaboration_request_id");

-- CreateIndex
CREATE INDEX "idea_members_user_id_idx" ON "idea_members"("user_id");

-- CreateIndex
CREATE INDEX "idea_members_role_id_idx" ON "idea_members"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "idea_members_idea_id_user_id_key" ON "idea_members"("idea_id", "user_id");

-- AddForeignKey
ALTER TABLE "business_ideas" ADD CONSTRAINT "business_ideas_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_ideas" ADD CONSTRAINT "business_ideas_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "business_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_ideas" ADD CONSTRAINT "business_ideas_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_ideas" ADD CONSTRAINT "business_ideas_converted_business_id_fkey" FOREIGN KEY ("converted_business_id") REFERENCES "business_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_roles" ADD CONSTRAINT "idea_roles_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "business_ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_role_skills" ADD CONSTRAINT "idea_role_skills_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "idea_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_role_skills" ADD CONSTRAINT "idea_role_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_access" ADD CONSTRAINT "idea_access_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "business_ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_access" ADD CONSTRAINT "idea_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_access" ADD CONSTRAINT "idea_access_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_detail_views" ADD CONSTRAINT "idea_detail_views_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "business_ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_detail_views" ADD CONSTRAINT "idea_detail_views_viewer_user_id_fkey" FOREIGN KEY ("viewer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_members" ADD CONSTRAINT "idea_members_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "business_ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_members" ADD CONSTRAINT "idea_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_members" ADD CONSTRAINT "idea_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "idea_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_members" ADD CONSTRAINT "idea_members_collaboration_request_id_fkey" FOREIGN KEY ("collaboration_request_id") REFERENCES "collaboration_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_idea_role_id_fkey" FOREIGN KEY ("idea_role_id") REFERENCES "idea_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The public line stays a line; titles aren't blank.
ALTER TABLE "business_ideas" ADD CONSTRAINT "business_ideas_text_check"
  CHECK (btrim("title") <> '' AND char_length("summary") BETWEEN 1 AND 160) NOT VALID;
ALTER TABLE "business_ideas" VALIDATE CONSTRAINT "business_ideas_text_check";

-- CONVERTED exactly when it was converted.
ALTER TABLE "business_ideas" ADD CONSTRAINT "business_ideas_converted_check"
  CHECK (("stage" = 'CONVERTED') = ("converted_at" IS NOT NULL)) NOT VALID;
ALTER TABLE "business_ideas" VALIDATE CONSTRAINT "business_ideas_converted_check";

-- An approval is stamped with who approved it and when.
ALTER TABLE "idea_access" ADD CONSTRAINT "idea_access_approval_check"
  CHECK ("status" <> 'APPROVED' OR ("approved_by_user_id" IS NOT NULL AND "approved_at" IS NOT NULL)) NOT VALID;
ALTER TABLE "idea_access" VALIDATE CONSTRAINT "idea_access_approval_check";
