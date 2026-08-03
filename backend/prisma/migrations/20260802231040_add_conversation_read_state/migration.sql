-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "ownerLastReadAt" TIMESTAMP(3),
ADD COLUMN     "renterLastReadAt" TIMESTAMP(3);
