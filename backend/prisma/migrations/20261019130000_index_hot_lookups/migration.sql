-- Additive indexes for hot lookups and job scans (hardening Phase 3).
-- Plain CREATE INDEX: at production's current size each builds in well under
-- a second. On a large table, build it CONCURRENTLY by hand first instead.

-- CreateIndex
CREATE INDEX "users_expoPushToken_idx" ON "users"("expoPushToken");

-- CreateIndex
CREATE INDEX "bookings_status_completedAt_idx" ON "bookings"("status", "completedAt");

-- CreateIndex
CREATE INDEX "bookings_paymentStatus_idx" ON "bookings"("paymentStatus");

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX "reviews_revieweeId_reviewerRole_idx" ON "reviews"("revieweeId", "reviewerRole");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "disputes_bookingId_idx" ON "disputes"("bookingId");

-- CreateIndex
CREATE INDEX "disputes_raisedByUserId_createdAt_idx" ON "disputes"("raisedByUserId", "createdAt" DESC);
