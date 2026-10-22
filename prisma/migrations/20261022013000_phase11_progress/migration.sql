-- CreateEnum
CREATE TYPE "progress_level" AS ENUM ('PROJECT', 'WBS', 'ACTIVITY');

-- AlterTable
ALTER TABLE "constraints" ADD COLUMN     "client_uuid" UUID;

-- AlterTable
ALTER TABLE "field_diaries" ADD COLUMN     "client_uuid" UUID;

-- AlterTable
ALTER TABLE "field_tasks" ADD COLUMN     "client_uuid" UUID;

-- AlterTable
ALTER TABLE "photo_evidence" ADD COLUMN     "client_uuid" UUID;

-- CreateTable
CREATE TABLE "progress_measurements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "measurement_date" DATE NOT NULL,
    "level" "progress_level" NOT NULL DEFAULT 'PROJECT',
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "method" "progress_method" NOT NULL DEFAULT 'PHYSICAL',
    "progress_percent" INTEGER NOT NULL,
    "quantity_planned" DOUBLE PRECISION,
    "quantity_real" DOUBLE PRECISION,
    "unit" VARCHAR(16),
    "criterion" TEXT NOT NULL,
    "notes" TEXT,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "progress_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "progress_measurements_organization_id_project_id_idx" ON "progress_measurements"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "progress_measurements_organization_id_project_id_measuremen_idx" ON "progress_measurements"("organization_id", "project_id", "measurement_date");

-- CreateIndex
CREATE INDEX "progress_measurements_organization_id_project_id_activity_i_idx" ON "progress_measurements"("organization_id", "project_id", "activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "progress_measurements_project_id_code_key" ON "progress_measurements"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "progress_measurements_project_id_client_uuid_key" ON "progress_measurements"("project_id", "client_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "constraints_project_id_client_uuid_key" ON "constraints"("project_id", "client_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "field_diaries_project_id_client_uuid_key" ON "field_diaries"("project_id", "client_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "field_tasks_project_id_client_uuid_key" ON "field_tasks"("project_id", "client_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "photo_evidence_project_id_client_uuid_key" ON "photo_evidence"("project_id", "client_uuid");

-- AddForeignKey
ALTER TABLE "progress_measurements" ADD CONSTRAINT "progress_measurements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_measurements" ADD CONSTRAINT "progress_measurements_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_measurements" ADD CONSTRAINT "progress_measurements_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

