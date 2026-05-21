-- AlterTable
ALTER TABLE "tenant_dlcs" ADD COLUMN     "scoped_property_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

