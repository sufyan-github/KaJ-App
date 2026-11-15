-- Rollback of 20261116100100_validate_check_constraints: nothing to undo in
-- the schema (a validated constraint is dropped by the previous migration's
-- down.sql). Delete this migration's row from _prisma_migrations.
SELECT 1;
