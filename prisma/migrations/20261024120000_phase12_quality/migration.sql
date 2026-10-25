-- CreateEnum
CREATE TYPE "checklist_execution_status" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "inspection_status" AS ENUM ('PLANNED', 'EXECUTED', 'PASSED', 'FAILED', 'CLOSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "photo_evidence" ADD COLUMN     "inspection_id" UUID;

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_executions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "template_id" UUID NOT NULL,
    "template_code" VARCHAR(32) NOT NULL,
    "template_name" VARCHAR(200) NOT NULL,
    "inspection_id" UUID,
    "status" "checklist_execution_status" NOT NULL DEFAULT 'DRAFT',
    "items" JSONB NOT NULL DEFAULT '[]',
    "inspector_id" UUID,
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(1000),
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "checklist_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "inspection_date" DATE NOT NULL,
    "status" "inspection_status" NOT NULL DEFAULT 'PLANNED',
    "inspector_id" UUID,
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "criterion" TEXT NOT NULL,
    "result_notes" TEXT,
    "executed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(1000),
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_templates_organization_id_project_id_idx" ON "checklist_templates"("organization_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_project_id_code_key" ON "checklist_templates"("project_id", "code");

-- CreateIndex
CREATE INDEX "checklist_executions_organization_id_project_id_idx" ON "checklist_executions"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "checklist_executions_organization_id_project_id_status_idx" ON "checklist_executions"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "checklist_executions_organization_id_inspection_id_idx" ON "checklist_executions"("organization_id", "inspection_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_executions_project_id_code_key" ON "checklist_executions"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_executions_project_id_client_uuid_key" ON "checklist_executions"("project_id", "client_uuid");

-- CreateIndex
CREATE INDEX "inspections_organization_id_project_id_idx" ON "inspections"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "inspections_organization_id_project_id_status_idx" ON "inspections"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "inspections_organization_id_project_id_inspection_date_idx" ON "inspections"("organization_id", "project_id", "inspection_date");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_project_id_code_key" ON "inspections"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_project_id_client_uuid_key" ON "inspections"("project_id", "client_uuid");

-- AddForeignKey
ALTER TABLE "photo_evidence" ADD CONSTRAINT "photo_evidence_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
