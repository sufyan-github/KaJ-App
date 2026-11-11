-- Operator branding update: Airtel is now Cirkle. Display names only;
-- the operator code AIRTEL stays the stable identifier.
UPDATE "mobile_operators"
SET "name_en" = 'Cirkle', "name_bn" = 'সার্কেল'
WHERE "code" = 'AIRTEL';
