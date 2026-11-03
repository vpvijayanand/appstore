-- AlterTable
ALTER TABLE "app_assignments" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "popup_interval_hours" INTEGER NOT NULL DEFAULT 4,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- RenameIndex
ALTER INDEX "advertisement_assignments_advertisement_id_terminal_master_id_k" RENAME TO "advertisement_assignments_advertisement_id_terminal_master__key";
