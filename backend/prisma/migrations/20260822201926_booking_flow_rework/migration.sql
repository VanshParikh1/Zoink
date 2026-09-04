-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "message",
ADD COLUMN     "conversationId" TEXT;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
