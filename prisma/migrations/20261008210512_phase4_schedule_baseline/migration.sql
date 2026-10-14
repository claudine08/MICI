-- CreateEnum
CREATE TYPE "baseline_type" AS ENUM ('SCOPE', 'SCHEDULE', 'COST', 'SUSTAINABILITY');

-- CreateEnum
CREATE TYPE "baseline_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "baselines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" "baseline_type" NOT NULL DEFAULT 'SCHEDULE',
    "version" INTEGER NOT NULL,
    "status" "baseline_status" NOT NULL DEFAULT 'DRAFT',
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "baselines_organization_id_project_id_type_idx" ON "baselines"("organization_id", "project_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "baselines_project_id_type_version_key" ON "baselines"("project_id", "type", "version");

-- AddForeignKey
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
