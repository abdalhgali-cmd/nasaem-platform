-- Correct the published Egypt Security Approval price that was entered
-- as a local-currency amount while the record still carried the SAR code.
-- The guard keeps this migration narrow: it changes only the known incorrect
-- record/value and leaves any later administrator price change untouched.
UPDATE "VisaType"
SET "currency" = 'SDG'
WHERE "code" = 'VISA-EGYPT-CLEARANCE'
  AND "currency" = 'SAR'
  AND "basePrice" = 930000;
