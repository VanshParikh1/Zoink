-- Backfill existing NULL phone values before enforcing NOT NULL. Phone was
-- previously optional; any user who registered before this migration has no
-- real phone number on file. This placeholder makes the backfill obvious
-- rather than resembling a real number.
UPDATE "users" SET "phone" = '+10000000000' WHERE "phone" IS NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL;
