-- App Review 5.1.1(v): phone is optional at sign-up.
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;

-- Not real numbers: deleted accounts were tombstoned with '', and
-- 20260730000000_make_phone_required backfilled missing phones with +10000000000.
UPDATE "users" SET "phone" = NULL WHERE "phone" IN ('', '+10000000000');
