-- AlterTable
ALTER TABLE "reviews" DROP COLUMN "comment",
ADD COLUMN     "itemNotes" TEXT,
ADD COLUMN     "itemRating" INTEGER;
