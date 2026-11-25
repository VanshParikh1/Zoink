-- AlterEnum
ALTER TYPE "BookingEventType" ADD VALUE 'DEPOSIT_CAPTURE_REQUESTED';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "depositCaptureCents" INTEGER;
