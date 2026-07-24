-- Apply the role + disputes migration to zoink_test
-- The original migration.sql has an ALTER TABLE "disputes" before CREATE TABLE "disputes"
-- which fails on a fresh DB. This script applies the same changes in the correct order.

-- 1. Add Role enum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- 2. Add DisputeReason enum
CREATE TYPE "DisputeReason" AS ENUM ('ITEM_DAMAGED', 'ITEM_NOT_RETURNED', 'ITEM_NOT_AS_DESCRIBED', 'PAYMENT_ISSUE', 'OTHER');

-- 3. Expand DisputeStatus enum (only bookings table exists at this point; disputes table doesn't exist yet)
BEGIN;
CREATE TYPE "DisputeStatus_new" AS ENUM ('NONE', 'OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'DISMISSED');
ALTER TABLE "bookings" ALTER COLUMN "disputeStatus" DROP DEFAULT;
ALTER TABLE "bookings" ALTER COLUMN "disputeStatus" TYPE "DisputeStatus_new" USING ("disputeStatus"::text::"DisputeStatus_new");
ALTER TYPE "DisputeStatus" RENAME TO "DisputeStatus_old";
ALTER TYPE "DisputeStatus_new" RENAME TO "DisputeStatus";
DROP TYPE "DisputeStatus_old";
ALTER TABLE "bookings" ALTER COLUMN "disputeStatus" SET DEFAULT 'NONE';
COMMIT;

-- 4. Add role column to users
ALTER TABLE "users" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER';

-- 5. Create disputes table (now DisputeStatus enum is already updated)
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "raisedByUserId" TEXT NOT NULL,
    "reason" "DisputeReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNotes" TEXT,
    "resolvedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- 6. Foreign keys for disputes
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raisedByUserId_fkey"
    FOREIGN KEY ("raisedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolvedByAdminId_fkey"
    FOREIGN KEY ("resolvedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Mark this migration as applied in _prisma_migrations so prisma migrate deploy
--    doesn't try to re-run it
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES (
    gen_random_uuid()::text,
    'manual_apply',
    NOW(),
    '20260721000000_add_role_and_disputes',
    NULL,
    NULL,
    NOW(),
    1
) ON CONFLICT DO NOTHING;
