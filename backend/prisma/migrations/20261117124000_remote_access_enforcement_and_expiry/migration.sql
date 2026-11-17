-- AlterTable
ALTER TABLE "remote_access_requests"
ADD COLUMN "consumed_at" TIMESTAMP(3),
ADD COLUMN "consumed_session_id" TEXT;

-- Enforce at most one pending request per terminal (race-proof at DB layer)
CREATE UNIQUE INDEX "remote_access_one_pending_per_terminal"
ON "remote_access_requests"("terminal_id")
WHERE "status" = 'PENDING';
