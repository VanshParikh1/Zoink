-- CreateTable
CREATE TABLE "verification_email_sends" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_email_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_email_sends_email_createdAt_idx" ON "verification_email_sends"("email", "createdAt");
