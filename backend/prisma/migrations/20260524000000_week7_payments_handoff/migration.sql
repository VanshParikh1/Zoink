CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING_AUTH',
  'AUTHORIZED',
  'CAPTURE_PENDING',
  'CAPTURED',
  'REFUND_PENDING',
  'REFUNDED',
  'PAYOUT_PENDING',
  'PAID_OUT',
  'FAILED'
);

CREATE TYPE "DisputeStatus" AS ENUM (
  'NONE',
  'OPEN',
  'RESOLVED'
);

CREATE TYPE "BookingEventType" AS ENUM (
  'STATUS_CHANGE',
  'PAYMENT_INTENT_CREATED',
  'PAYMENT_CAPTURED',
  'PAYMENT_REFUNDED',
  'PAYOUT_TRIGGERED',
  'ZOINK_TAP',
  'UPLOAD_PHOTOS',
  'DISPUTE_OPENED',
  'DISPUTE_RESOLVED',
  'WEBHOOK_RECEIVED',
  'RECONCILIATION_MATCH',
  'RECONCILIATION_MISMATCH',
  'ERROR'
);

ALTER TABLE "listings"
ADD COLUMN "itemValue" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "bookings"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING_AUTH',
ADD COLUMN "depositAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "commissionAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "ownerPayout" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "insuranceOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "insuranceFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "stripeTransferId" TEXT,
ADD COLUMN "refundedAt" TIMESTAMP(3),
ADD COLUMN "pickupPhotos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "returnPhotos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "ownerPickupTappedAt" TIMESTAMP(3),
ADD COLUMN "renterPickupTappedAt" TIMESTAMP(3),
ADD COLUMN "ownerReturnTappedAt" TIMESTAMP(3),
ADD COLUMN "renterReturnTappedAt" TIMESTAMP(3),
ADD COLUMN "disputeStatus" "DisputeStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "disputedAt" TIMESTAMP(3),
ADD COLUMN "disputeReason" TEXT;

UPDATE "bookings"
SET
  "depositAmount" = ROUND(("totalPrice" * 0.30)::numeric, 2),
  "commissionAmount" = ROUND(("totalPrice" * 0.15)::numeric, 2),
  "ownerPayout" = ROUND(("totalPrice" * 0.85)::numeric, 2),
  "paymentStatus" = CASE
    WHEN "paidAt" IS NOT NULL THEN 'CAPTURED'::"PaymentStatus"
    ELSE 'PENDING_AUTH'::"PaymentStatus"
  END;

CREATE TABLE "booking_events" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "actorId" TEXT,
  "type" "BookingEventType" NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "booking_events"
ADD CONSTRAINT "booking_events_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "bookings"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
