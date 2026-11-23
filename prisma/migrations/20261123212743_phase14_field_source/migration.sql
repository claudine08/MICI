-- AlterTable
ALTER TABLE "constraints" ADD COLUMN     "source" VARCHAR(16) NOT NULL DEFAULT 'APP';

-- AlterTable
ALTER TABLE "field_diaries" ADD COLUMN     "source" VARCHAR(16) NOT NULL DEFAULT 'APP';

-- AlterTable
ALTER TABLE "field_tasks" ADD COLUMN     "source" VARCHAR(16) NOT NULL DEFAULT 'APP';

-- AlterTable
ALTER TABLE "photo_evidence" ADD COLUMN     "source" VARCHAR(16) NOT NULL DEFAULT 'APP';

-- AlterTable
ALTER TABLE "progress_measurements" ADD COLUMN     "source" VARCHAR(16) NOT NULL DEFAULT 'APP';
