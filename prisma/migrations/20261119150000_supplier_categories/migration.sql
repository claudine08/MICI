ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "suppliers" SET "categories" = ARRAY["category"] WHERE "category" IS NOT NULL AND "category" <> '' AND ( "categories" IS NULL OR "categories" = ARRAY[]::TEXT[] );
ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "category";
ALTER TABLE "supplier_rfi_recipients" ADD COLUMN IF NOT EXISTS "requested_category" VARCHAR(100);
