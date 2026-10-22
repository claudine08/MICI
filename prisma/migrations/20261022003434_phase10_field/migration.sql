-- CreateEnum
CREATE TYPE "field_diary_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "field_task_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "field_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "constraint_status" AS ENUM ('OPEN', 'ADDRESSED', 'REMOVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "constraint_type" AS ENUM ('SCOPE', 'SCHEDULE', 'COST', 'RESOURCE', 'TECHNICAL', 'EXTERNAL', 'REGULATORY', 'SAFETY');

-- CreateTable
CREATE TABLE "field_diaries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "entry_date" DATE NOT NULL,
    "status" "field_diary_status" NOT NULL DEFAULT 'DRAFT',
    "team" VARCHAR(300),
    "work_hours" DECIMAL(8,2),
    "activities" TEXT,
    "progress_notes" TEXT,
    "equipment" TEXT,
    "materials" TEXT,
    "occurrences" TEXT,
    "constraint_notes" TEXT,
    "conditions" TEXT,
    "inspections" TEXT,
    "safety" TEXT,
    "visitors" TEXT,
    "decisions" TEXT,
    "water" DECIMAL(12,3),
    "energy" DECIMAL(12,3),
    "waste_notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "submitted_by" UUID,
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "reject_reason" VARCHAR(1000),
    "cancel_reason" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "field_diaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "diary_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "field_task_status" NOT NULL DEFAULT 'OPEN',
    "priority" "field_priority" NOT NULL DEFAULT 'MEDIUM',
    "assignee_id" UUID,
    "due_date" DATE,
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "field_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "constraints" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "type" "constraint_type" NOT NULL DEFAULT 'EXTERNAL',
    "priority" "field_priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "constraint_status" NOT NULL DEFAULT 'OPEN',
    "owner_id" UUID,
    "due_date" DATE,
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "identified_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "resolution" TEXT,
    "cancel_reason" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_evidence" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "diary_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "caption" VARCHAR(300),
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(127) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "content" BYTEA NOT NULL,
    "taken_at" TIMESTAMP(3),
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "photo_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_diaries_organization_id_project_id_idx" ON "field_diaries"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "field_diaries_organization_id_project_id_entry_date_idx" ON "field_diaries"("organization_id", "project_id", "entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "field_diaries_project_id_code_key" ON "field_diaries"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "field_diaries_project_id_entry_date_key" ON "field_diaries"("project_id", "entry_date");

-- CreateIndex
CREATE INDEX "field_tasks_organization_id_project_id_idx" ON "field_tasks"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "field_tasks_organization_id_project_id_status_idx" ON "field_tasks"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "field_tasks_organization_id_diary_id_idx" ON "field_tasks"("organization_id", "diary_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_tasks_project_id_code_key" ON "field_tasks"("project_id", "code");

-- CreateIndex
CREATE INDEX "constraints_organization_id_project_id_idx" ON "constraints"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "constraints_organization_id_project_id_status_idx" ON "constraints"("organization_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "constraints_project_id_code_key" ON "constraints"("project_id", "code");

-- CreateIndex
CREATE INDEX "photo_evidence_organization_id_project_id_idx" ON "photo_evidence"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "photo_evidence_organization_id_diary_id_idx" ON "photo_evidence"("organization_id", "diary_id");

-- CreateIndex
CREATE UNIQUE INDEX "photo_evidence_project_id_code_key" ON "photo_evidence"("project_id", "code");

-- AddForeignKey
ALTER TABLE "field_diaries" ADD CONSTRAINT "field_diaries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_tasks" ADD CONSTRAINT "field_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_tasks" ADD CONSTRAINT "field_tasks_diary_id_fkey" FOREIGN KEY ("diary_id") REFERENCES "field_diaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_tasks" ADD CONSTRAINT "field_tasks_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_tasks" ADD CONSTRAINT "field_tasks_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constraints" ADD CONSTRAINT "constraints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constraints" ADD CONSTRAINT "constraints_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constraints" ADD CONSTRAINT "constraints_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_evidence" ADD CONSTRAINT "photo_evidence_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_evidence" ADD CONSTRAINT "photo_evidence_diary_id_fkey" FOREIGN KEY ("diary_id") REFERENCES "field_diaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_evidence" ADD CONSTRAINT "photo_evidence_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_evidence" ADD CONSTRAINT "photo_evidence_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
