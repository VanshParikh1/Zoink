-- The charge a captured deposit created (the deposit-compensation transfer's
-- source_transaction) and the transfer that paid it to the owner. Both
-- nullable: a transfer that hasn't gone through yet is retried by a job.
ALTER TABLE "bookings" ADD COLUMN "stripeDepositChargeId" TEXT,
ADD COLUMN "stripeDepositTransferId" TEXT;
