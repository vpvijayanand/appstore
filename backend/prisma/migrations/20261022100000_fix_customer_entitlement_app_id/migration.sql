-- Fixes schema drift: schema.prisma defines CustomerEntitlement.appId (app_id),
-- but the init migration mistakenly created a category_id column/FK instead.

-- DropForeignKey
ALTER TABLE "customer_entitlements" DROP CONSTRAINT IF EXISTS "customer_entitlements_category_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "customer_entitlements_customer_id_category_id_key";

-- AlterTable
ALTER TABLE "customer_entitlements" DROP COLUMN IF EXISTS "category_id";
ALTER TABLE "customer_entitlements" ADD COLUMN "app_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "customer_entitlements_customer_id_app_id_key" ON "customer_entitlements"("customer_id", "app_id");

-- AddForeignKey
ALTER TABLE "customer_entitlements" ADD CONSTRAINT "customer_entitlements_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
