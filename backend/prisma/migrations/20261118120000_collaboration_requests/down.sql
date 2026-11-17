-- Rollback of 20261118120000_collaboration_requests. Roll the app back first.
-- The linked conversations stay (as plain conversations).
DROP TABLE IF EXISTS "collaboration_request_events";
DROP TABLE IF EXISTS "collaboration_requests";
DROP TYPE IF EXISTS "CollaborationStatus";
DROP TYPE IF EXISTS "CollaborationSubjectType";
