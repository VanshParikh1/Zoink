-- Set while an admin has suspended the account (D-9): it can't start anything
-- new and its listings are hidden from browse; existing rentals can finish.
ALTER TABLE "users" ADD COLUMN "suspendedAt" TIMESTAMP(3);
