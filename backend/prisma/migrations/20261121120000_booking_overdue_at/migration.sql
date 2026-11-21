-- D-1: when the overdue job flagged a rental whose return wasn't completed by
-- the end of the day after its last day. Null = never overdue.
ALTER TYPE "NotificationType" ADD VALUE 'RENTAL_OVERDUE';
ALTER TABLE "bookings" ADD COLUMN "overdueAt" TIMESTAMP(3);
