-- CreateTable
CREATE TABLE "referrals" (
    "referral_id" SERIAL NOT NULL,
    "name" TEXT,
    "college_name" TEXT,
    "referral_code" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("referral_id")
);

-- CreateTable
CREATE TABLE "processing_metadata" (
    "id" SERIAL NOT NULL,
    "file_name" TEXT NOT NULL,
    "last_processed_line" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processing_metadata_file_name_key" ON "processing_metadata"("file_name");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referral_code_fkey" FOREIGN KEY ("referral_code") REFERENCES "users"("phone_no") ON DELETE RESTRICT ON UPDATE CASCADE;
