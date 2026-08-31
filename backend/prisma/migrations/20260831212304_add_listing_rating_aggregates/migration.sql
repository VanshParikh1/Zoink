-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "avgRating" DOUBLE PRECISION,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill the rollup from existing borrower-authored item ratings.
UPDATE "listings" l
SET "avgRating" = sub.avg_rating,
    "reviewCount" = sub.review_count
FROM (
  SELECT b."listingId" AS listing_id,
         AVG(r."itemRating")::double precision AS avg_rating,
         COUNT(r."itemRating")::integer AS review_count
  FROM "reviews" r
  JOIN "bookings" b ON b."id" = r."bookingId"
  WHERE r."itemRating" IS NOT NULL
  GROUP BY b."listingId"
) sub
WHERE l."id" = sub.listing_id;
