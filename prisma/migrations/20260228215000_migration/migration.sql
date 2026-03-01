-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "storage_usage" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "uploads" (
    "upload_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'pending',
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("upload_id")
);

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
