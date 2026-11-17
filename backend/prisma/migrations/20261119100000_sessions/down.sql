-- Rollback of 20261119100000_sessions. Roll the app back first. PostgreSQL
-- can't drop an enum value: ReviewSubjectType.SESSION stays, unused (delete
-- SESSION reviews first if wanted).
DROP TABLE IF EXISTS "session_participants";
DROP TABLE IF EXISTS "sessions";
DROP TYPE IF EXISTS "SessionParticipantStatus";
DROP TYPE IF EXISTS "SessionParticipantRole";
DROP TYPE IF EXISTS "SessionStatus";
DROP TYPE IF EXISTS "SessionPriceModel";
DROP TYPE IF EXISTS "SessionMode";
DROP TYPE IF EXISTS "SessionSubjectType";
DROP TYPE IF EXISTS "SessionKind";
