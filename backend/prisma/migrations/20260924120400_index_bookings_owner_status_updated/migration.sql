-- CreateIndex
CREATE INDEX "bookings_ownerId_status_updatedAt_idx" ON "bookings"("ownerId", "status", "updatedAt" DESC);
