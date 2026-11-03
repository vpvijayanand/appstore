/*
  Warnings:

  - A unique constraint covering the columns `[advertisement_id,group_id]` on the table `advertisement_assignments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "AssignmentScope" ADD VALUE 'GROUP';

-- AlterTable
ALTER TABLE "advertisement_assignments" ADD COLUMN     "group_id" TEXT;

-- CreateTable
CREATE TABLE "terminal_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "customer_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TerminalGroupMembers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "terminal_groups_name_key" ON "terminal_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_TerminalGroupMembers_AB_unique" ON "_TerminalGroupMembers"("A", "B");

-- CreateIndex
CREATE INDEX "_TerminalGroupMembers_B_index" ON "_TerminalGroupMembers"("B");

-- CreateIndex
CREATE INDEX "advertisement_assignments_group_id_idx" ON "advertisement_assignments"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "advertisement_assignments_advertisement_id_group_id_key" ON "advertisement_assignments"("advertisement_id", "group_id");

-- AddForeignKey
ALTER TABLE "terminal_groups" ADD CONSTRAINT "terminal_groups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertisement_assignments" ADD CONSTRAINT "advertisement_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "terminal_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TerminalGroupMembers" ADD CONSTRAINT "_TerminalGroupMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "terminal_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TerminalGroupMembers" ADD CONSTRAINT "_TerminalGroupMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "terminal_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
