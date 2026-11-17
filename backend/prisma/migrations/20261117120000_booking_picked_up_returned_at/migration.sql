-- When the item actually changed hands. Pickup and return used to overwrite
-- startDate/endDate with these moments, losing the booked days the overlap
-- check and any dispute rely on.
ALTER TABLE "bookings" ADD COLUMN "pickedUpAt" TIMESTAMP(3),
ADD COLUMN "returnedAt" TIMESTAMP(3);
