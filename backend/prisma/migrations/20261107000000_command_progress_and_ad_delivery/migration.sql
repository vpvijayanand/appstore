-- AlterTable
ALTER TABLE "device_commands" ADD COLUMN     "stage" TEXT,
ADD COLUMN     "stage_detail" TEXT,
ADD COLUMN     "stage_updated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "advertisement_deliveries" (
    "id" TEXT NOT NULL,
    "advertisement_id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "first_fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_shown_at" TIMESTAMP(3),
    "last_shown_at" TIMESTAMP(3),
    "show_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "advertisement_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "advertisement_deliveries_terminal_id_idx" ON "advertisement_deliveries"("terminal_id");

-- CreateIndex
CREATE UNIQUE INDEX "advertisement_deliveries_advertisement_id_terminal_id_key" ON "advertisement_deliveries"("advertisement_id", "terminal_id");

-- AddForeignKey
ALTER TABLE "advertisement_deliveries" ADD CONSTRAINT "advertisement_deliveries_advertisement_id_fkey" FOREIGN KEY ("advertisement_id") REFERENCES "advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertisement_deliveries" ADD CONSTRAINT "advertisement_deliveries_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
