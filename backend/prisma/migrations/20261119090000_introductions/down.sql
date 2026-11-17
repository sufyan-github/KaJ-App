-- Rollback of 20261119090000_introductions. Roll the app back first; the
-- conversations opened by accepted introductions stay as plain conversations.
DROP TABLE IF EXISTS "introduction_requests";
DROP TYPE IF EXISTS "IntroductionStatus";
DROP TYPE IF EXISTS "IntroductionContextType";
