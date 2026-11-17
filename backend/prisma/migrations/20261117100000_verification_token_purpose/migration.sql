-- One-time codes for email verification and for password resets share a
-- table; each code says which it is for, so one can never be used as the other.
CREATE TYPE "VerificationPurpose" AS ENUM ('VERIFY_EMAIL', 'PASSWORD_RESET');

ALTER TABLE "verification_tokens" ADD COLUMN "purpose" "VerificationPurpose" NOT NULL DEFAULT 'VERIFY_EMAIL';
