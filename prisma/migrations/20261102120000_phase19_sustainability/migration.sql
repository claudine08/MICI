-- CreateEnum
CREATE TYPE "sustainability_plan_status" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');


-- CreateTable
CREATE TABLE "sustainability_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "sustainability_plan_status" NOT NULL DEFAULT 'DRAFT',
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

    CONSTRAINT "sustainability_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sustainability_metrics" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "plan_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "category" VARCHAR(64),
    "description" TEXT,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "sustainability_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sustainability_baselines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "metric_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "recorded_at" DATE NOT NULL,
    "source" VARCHAR(200),
    "notes" TEXT,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "sustainability_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sustainability_targets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "metric_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "target_value" DECIMAL(14,4) NOT NULL,
    "due_date" DATE,
    "notes" TEXT,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "sustainability_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sustainability_measurements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "metric_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "measured_at" DATE NOT NULL,
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "notes" TEXT,
    "evidence_notes" TEXT,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "sustainability_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "waste_type" VARCHAR(120) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "destination" VARCHAR(200),
    "recorded_at" DATE NOT NULL,
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "notes" TEXT,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "waste_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sustainability_plans_organization_id_project_id_idx" ON "sustainability_plans"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "sustainability_plans_organization_id_project_id_status_idx" ON "sustainability_plans"("organization_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sustainability_plans_project_id_code_key" ON "sustainability_plans"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sustainability_plans_project_id_client_uuid_key" ON "sustainability_plans"("project_id", "client_uuid");

-- CreateIndex
CREATE INDEX "sustainability_metrics_organization_id_project_id_idx" ON "sustainability_metrics"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "sustainability_metrics_plan_id_idx" ON "sustainability_metrics"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "sustainability_metrics_project_id_code_key" ON "sustainability_metrics"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sustainability_metrics_project_id_client_uuid_key" ON "sustainability_metrics"("project_id", "client_uuid");

-- CreateIndex
CREATE INDEX "sustainability_baselines_organization_id_project_id_idx" ON "sustainability_baselines"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "sustainability_baselines_metric_id_idx" ON "sustainability_baselines"("metric_id");

-- CreateIndex
CREATE UNIQUE INDEX "sustainability_baselines_project_id_code_key" ON "sustainability_baselines"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sustainability_baselines_project_id_client_uuid_key" ON "sustainability_baselines"("project_id", "client_uuid");

-- CreateIndex
CREATE INDEX "sustainability_targets_organization_id_project_id_idx" ON "sustainability_targets"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "sustainability_targets_metric_id_idx" ON "sustainability_targets"("metric_id");

-- CreateIndex
CREATE UNIQUE INDEX "sustainability_targets_project_id_code_key" ON "sustainability_targets"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sustainability_targets_project_id_client_uuid_key" ON "sustainability_targets"("project_id", "client_uuid");

-- CreateIndex
CREATE INDEX "sustainability_measurements_organization_id_project_id_idx" ON "sustainability_measurements"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "sustainability_measurements_metric_id_idx" ON "sustainability_measurements"("metric_id");

-- CreateIndex
CREATE UNIQUE INDEX "sustainability_measurements_project_id_code_key" ON "sustainability_measurements"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sustainability_measurements_project_id_client_uuid_key" ON "sustainability_measurements"("project_id", "client_uuid");

-- CreateIndex
CREATE INDEX "waste_records_organization_id_project_id_idx" ON "waste_records"("organization_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "waste_records_project_id_code_key" ON "waste_records"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "waste_records_project_id_client_uuid_key" ON "waste_records"("project_id", "client_uuid");

-- AddForeignKey
ALTER TABLE "sustainability_plans" ADD CONSTRAINT "sustainability_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_plans" ADD CONSTRAINT "sustainability_plans_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_plans" ADD CONSTRAINT "sustainability_plans_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_metrics" ADD CONSTRAINT "sustainability_metrics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_metrics" ADD CONSTRAINT "sustainability_metrics_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "sustainability_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_baselines" ADD CONSTRAINT "sustainability_baselines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_baselines" ADD CONSTRAINT "sustainability_baselines_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "sustainability_metrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_targets" ADD CONSTRAINT "sustainability_targets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_targets" ADD CONSTRAINT "sustainability_targets_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "sustainability_metrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_measurements" ADD CONSTRAINT "sustainability_measurements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_measurements" ADD CONSTRAINT "sustainability_measurements_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "sustainability_metrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_measurements" ADD CONSTRAINT "sustainability_measurements_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustainability_measurements" ADD CONSTRAINT "sustainability_measurements_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

