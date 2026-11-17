-- CreateEnum
CREATE TYPE "RemoteAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "remote_access_requests" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "status" "RemoteAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_by" TEXT,
    "message" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,

    CONSTRAINT "remote_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "remote_access_requests_terminal_id_status_idx" ON "remote_access_requests"("terminal_id", "status");

-- CreateIndex
CREATE INDEX "remote_access_requests_status_requested_at_idx" ON "remote_access_requests"("status", "requested_at");

-- AddForeignKey
ALTER TABLE "remote_access_requests" ADD CONSTRAINT "remote_access_requests_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
