-- CreateEnum
CREATE TYPE "commissioning_plan_status" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "commissioning_item_status" AS ENUM ('PLANNED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'RETESTING', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "commissioning_item_result" AS ENUM ('PASS', 'FAIL', 'NA');

-- CreateEnum
CREATE TYPE "acceptance_status" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');


-- CreateTable
CREATE TABLE "commissioning_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "commissioning_plan_status" NOT NULL DEFAULT 'DRAFT',
    "owner_id" UUID,
    "start_date" DATE,
    "planned_end_date" DATE,
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "commissioning_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissioning_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "system_name" VARCHAR(200),
    "test_method" TEXT,
    "acceptance_criteria" TEXT,
    "status" "commissioning_item_status" NOT NULL DEFAULT 'PLANNED',
    "result" "commissioning_item_result",
    "notes" TEXT,
    "reject_reason" VARCHAR(1000),
    "retest_count" INTEGER NOT NULL DEFAULT 0,
    "evidence_photo_id" UUID,
    "evidence_notes" TEXT,
    "executed_by" UUID,
    "executed_at" TIMESTAMP(3),
    "verified_by" UUID,
    "verified_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "inspection_id" UUID,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "commissioning_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acceptances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "commissioning_plan_id" UUID,
    "scope" TEXT NOT NULL,
    "status" "acceptance_status" NOT NULL DEFAULT 'DRAFT',
    "accepted_by" UUID,
    "accepted_at" TIMESTAMP(3),
    "notes" TEXT,
    "reject_reason" VARCHAR(1000),
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "document_id" UUID,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commissioning_plans_organization_id_project_id_idx" ON "commissioning_plans"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "commissioning_plans_organization_id_project_id_status_idx" ON "commissioning_plans"("organization_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "commissioning_plans_project_id_code_key" ON "commissioning_plans"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "commissioning_plans_project_id_client_uuid_key" ON "commissioning_plans"("project_id", "client_uuid");

-- CreateIndex
CREATE INDEX "commissioning_items_organization_id_project_id_idx" ON "commissioning_items"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "commissioning_items_plan_id_idx" ON "commissioning_items"("plan_id");

-- CreateIndex
CREATE INDEX "commissioning_items_organization_id_project_id_status_idx" ON "commissioning_items"("organization_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "commissioning_items_project_id_code_key" ON "commissioning_items"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "commissioning_items_project_id_client_uuid_key" ON "commissioning_items"("project_id", "client_uuid");

-- CreateIndex
CREATE INDEX "acceptances_organization_id_project_id_idx" ON "acceptances"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "acceptances_commissioning_plan_id_idx" ON "acceptances"("commissioning_plan_id");

-- CreateIndex
CREATE INDEX "acceptances_organization_id_project_id_status_idx" ON "acceptances"("organization_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "acceptances_project_id_code_key" ON "acceptances"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "acceptances_project_id_client_uuid_key" ON "acceptances"("project_id", "client_uuid");

-- AddForeignKey
ALTER TABLE "commissioning_plans" ADD CONSTRAINT "commissioning_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_plans" ADD CONSTRAINT "commissioning_plans_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_plans" ADD CONSTRAINT "commissioning_plans_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_items" ADD CONSTRAINT "commissioning_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_items" ADD CONSTRAINT "commissioning_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "commissioning_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_items" ADD CONSTRAINT "commissioning_items_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_items" ADD CONSTRAINT "commissioning_items_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_items" ADD CONSTRAINT "commissioning_items_evidence_photo_id_fkey" FOREIGN KEY ("evidence_photo_id") REFERENCES "photo_evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_commissioning_plan_id_fkey" FOREIGN KEY ("commissioning_plan_id") REFERENCES "commissioning_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

