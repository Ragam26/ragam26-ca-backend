-- DropForeignKey
ALTER TABLE "referrals" DROP CONSTRAINT "referrals_referral_code_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- AlterTable
ALTER TABLE "referrals" ALTER COLUMN "referral_code" DROP NOT NULL;
