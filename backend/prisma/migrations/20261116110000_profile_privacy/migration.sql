-- P0.7 profile privacy settings. Constant defaults, so no table rewrite;
-- the defaults keep today's public behaviour. Rollback: down.sql.

-- CreateEnum
CREATE TYPE "PhotoVisibility" AS ENUM ('EVERYONE', 'AFTER_HIRE', 'NOBODY');

-- CreateEnum
CREATE TYPE "MessagePermission" AS ENUM ('ANYONE', 'ENGAGED_ONLY');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "allow_messages_from" "MessagePermission" NOT NULL DEFAULT 'ANYONE',
ADD COLUMN     "discoverable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "hide_precise_area" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photo_visibility" "PhotoVisibility" NOT NULL DEFAULT 'EVERYONE',
ADD COLUMN     "show_full_name" BOOLEAN NOT NULL DEFAULT false;

