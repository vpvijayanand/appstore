-- Add new DeviceCommandType values for remote screen sharing
ALTER TYPE "DeviceCommandType" ADD VALUE 'START_SCREEN_SHARE';
ALTER TYPE "DeviceCommandType" ADD VALUE 'STOP_SCREEN_SHARE';

-- CreateEnum
CREATE TYPE "ScreenShareStatus" AS ENUM ('PENDING', 'ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "screen_share_sessions" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "status" "ScreenShareStatus" NOT NULL DEFAULT 'PENDING',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connected_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "screen_share_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screen_share_sessions_terminal_id_status_idx" ON "screen_share_sessions"("terminal_id", "status");

-- AddForeignKey
ALTER TABLE "screen_share_sessions" ADD CONSTRAINT "screen_share_sessions_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
