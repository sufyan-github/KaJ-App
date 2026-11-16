-- Rollback of 20261117110000_capability_enums. PostgreSQL can't drop an enum
-- value: RoleMode.MENTOR and VerificationKind.MENTOR stay, unused (roll the
-- app back first). The new types are dropped once nothing uses them, then
-- delete the migration's row from _prisma_migrations.
DROP TYPE IF EXISTS "WorkArrangement";
DROP TYPE IF EXISTS "ParticipantTerms";
DROP TYPE IF EXISTS "OpportunityType";
DROP TYPE IF EXISTS "MentorStatus";
