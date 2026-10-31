-- CreateEnum
CREATE TYPE "AdvertisementType" AS ENUM ('IMAGE', 'VIDEO', 'HTML');

-- CreateEnum
CREATE TYPE "AdvertisementDisplayMode" AS ENUM ('POPUP', 'SCREENSAVER');

-- CreateTable
CREATE TABLE "advertisements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "AdvertisementType" NOT NULL,
    "media_url" TEXT,
    "media_object_name" TEXT,
    "html_content" TEXT,
    "display_mode" "AdvertisementDisplayMode" NOT NULL DEFAULT 'POPUP',
    "duration_seconds" INTEGER NOT NULL DEFAULT 10,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advertisements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advertisement_assignments" (
    "id" TEXT NOT NULL,
    "advertisement_id" TEXT NOT NULL,
    "scope" "AssignmentScope" NOT NULL,
    "customer_id" TEXT,
    "terminal_master_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advertisement_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "advertisement_assignments_customer_id_idx" ON "advertisement_assignments"("customer_id");

-- CreateIndex
CREATE INDEX "advertisement_assignments_terminal_master_id_idx" ON "advertisement_assignments"("terminal_master_id");

-- CreateIndex
CREATE UNIQUE INDEX "advertisement_assignments_advertisement_id_customer_id_key" ON "advertisement_assignments"("advertisement_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "advertisement_assignments_advertisement_id_terminal_master_id_key" ON "advertisement_assignments"("advertisement_id", "terminal_master_id");

-- AddForeignKey
ALTER TABLE "advertisement_assignments" ADD CONSTRAINT "advertisement_assignments_advertisement_id_fkey" FOREIGN KEY ("advertisement_id") REFERENCES "advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertisement_assignments" ADD CONSTRAINT "advertisement_assignments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertisement_assignments" ADD CONSTRAINT "advertisement_assignments_terminal_master_id_fkey" FOREIGN KEY ("terminal_master_id") REFERENCES "terminal_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
