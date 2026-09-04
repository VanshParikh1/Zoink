-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('AUTHORIZED', 'CAPTURED', 'RELEASED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "depositStatus" "DepositStatus",
ADD COLUMN     "stripeDepositPaymentIntentId" TEXT;
