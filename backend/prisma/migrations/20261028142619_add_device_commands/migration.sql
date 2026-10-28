-- CreateEnum
CREATE TYPE "DeviceCommandType" AS ENUM ('RESTART_APP');

-- CreateEnum
CREATE TYPE "DeviceCommandStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "device_commands" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "type" "DeviceCommandType" NOT NULL,
    "status" "DeviceCommandStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "device_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_commands_terminal_id_status_idx" ON "device_commands"("terminal_id", "status");

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
