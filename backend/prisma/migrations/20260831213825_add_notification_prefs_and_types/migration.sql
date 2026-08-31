-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MESSAGE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'DEPOSIT_RELEASED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notifyBookingActivity" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyDepositUpdates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyPaymentsPayouts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReviews" BOOLEAN NOT NULL DEFAULT true;
