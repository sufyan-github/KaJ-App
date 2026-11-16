-- P1.1/P1.2 enum types and values, alone in their own migration so the new
-- values are committed before any later migration or code uses them.
-- Rollback: down.sql. Enum values can't be removed, so they are added with
-- IF NOT EXISTS and this migration re-applies cleanly after a rollback.

-- CreateEnum
CREATE TYPE "MentorStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('WORK', 'TRAINING', 'APPRENTICESHIP');

-- CreateEnum
CREATE TYPE "ParticipantTerms" AS ENUM ('FREE', 'PAID_BY_PARTICIPANT', 'STIPEND', 'UNPAID');

-- CreateEnum
CREATE TYPE "WorkArrangement" AS ENUM ('ON_SITE', 'HOME_BASED', 'REMOTE', 'HYBRID');

-- AlterEnum
ALTER TYPE "RoleMode" ADD VALUE IF NOT EXISTS 'MENTOR';

-- AlterEnum
ALTER TYPE "VerificationKind" ADD VALUE IF NOT EXISTS 'MENTOR';

