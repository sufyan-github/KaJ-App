-- Rollback of 20261118110000_business_offerings. Roll the app back first.
DROP TABLE IF EXISTS "business_offerings";
DROP TYPE IF EXISTS "OfferingKind";
