/*
  Warnings:

  - A unique constraint covering the columns `[terminal_master_id]` on the table `terminals` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TerminalMasterStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AssignmentScope" AS ENUM ('CUSTOMER', 'TERMINAL');

-- CreateEnum
CREATE TYPE "AssignmentMode" AS ENUM ('DEFAULT', 'ON_REQUEST');

-- CreateEnum
CREATE TYPE "AppVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "apps" ADD COLUMN     "visibility" "AppVisibility" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "terminals" ADD COLUMN     "terminal_master_id" TEXT;

-- CreateTable
CREATE TABLE "terminal_masters" (
    "id" TEXT NOT NULL,
    "tid" TEXT NOT NULL,
    "serial_no" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "model" TEXT,
    "branch_code" TEXT,
    "site" TEXT,
    "notes" TEXT,
    "status" "TerminalMasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_assignments" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "scope" "AssignmentScope" NOT NULL,
    "customer_id" TEXT,
    "terminal_master_id" TEXT,
    "mode" "AssignmentMode" NOT NULL DEFAULT 'ON_REQUEST',
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_id" TEXT,

    CONSTRAINT "app_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "terminal_masters_tid_key" ON "terminal_masters"("tid");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_masters_serial_no_key" ON "terminal_masters"("serial_no");

-- CreateIndex
CREATE INDEX "app_assignments_customer_id_idx" ON "app_assignments"("customer_id");

-- CreateIndex
CREATE INDEX "app_assignments_terminal_master_id_idx" ON "app_assignments"("terminal_master_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_assignments_app_id_customer_id_key" ON "app_assignments"("app_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_assignments_app_id_terminal_master_id_key" ON "app_assignments"("app_id", "terminal_master_id");

-- CreateIndex
CREATE UNIQUE INDEX "terminals_terminal_master_id_key" ON "terminals"("terminal_master_id");

-- AddForeignKey
ALTER TABLE "terminal_masters" ADD CONSTRAINT "terminal_masters_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_assignments" ADD CONSTRAINT "app_assignments_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_assignments" ADD CONSTRAINT "app_assignments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_assignments" ADD CONSTRAINT "app_assignments_terminal_master_id_fkey" FOREIGN KEY ("terminal_master_id") REFERENCES "terminal_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_terminal_master_id_fkey" FOREIGN KEY ("terminal_master_id") REFERENCES "terminal_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
