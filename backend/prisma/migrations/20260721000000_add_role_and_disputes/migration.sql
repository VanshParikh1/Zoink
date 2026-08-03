-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('ITEM_DAMAGED', 'ITEM_NOT_RETURNED', 'ITEM_NOT_AS_DESCRIBED', 'PAYMENT_ISSUE', 'OTHER');

-- AlterEnum
-- Note: this migration also creates the "disputes" table for the first time (see
-- CreateTable below), so there is no pre-existing "disputes" row/column to widen here.
-- The original generated SQL included an `ALTER TABLE "disputes" ALTER COLUMN "status" ...`
-- line at this point, which ran before `CREATE TABLE "disputes"` and made `prisma migrate
-- deploy` fail on any fresh database with "relation \"disputes\" does not exist". It has
-- been removed: `CREATE TABLE "disputes"` below already declares "status" as "DisputeStatus",
-- which by that point in this same migration already refers to the renamed 6-value enum.
BEGIN;
CREATE TYPE "DisputeStatus_new" AS ENUM ('NONE', 'OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'DISMISSED');
ALTER TABLE "bookings" ALTER COLUMN "disputeStatus" DROP DEFAULT;
ALTER TABLE "bookings" ALTER COLUMN "disputeStatus" TYPE "DisputeStatus_new" USING ("disputeStatus"::text::"DisputeStatus_new");
ALTER TYPE "DisputeStatus" RENAME TO "DisputeStatus_old";
ALTER TYPE "DisputeStatus_new" RENAME TO "DisputeStatus";
DROP TYPE "DisputeStatus_old";
ALTER TABLE "bookings" ALTER COLUMN "disputeStatus" SET DEFAULT 'NONE';
COMMIT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';

-- CreateTable
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

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

