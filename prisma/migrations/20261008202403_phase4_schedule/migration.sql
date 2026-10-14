-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('TASK', 'MILESTONE', 'SUMMARY');

-- CreateEnum
CREATE TYPE "activity_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "dependency_type" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateEnum
CREATE TYPE "progress_method" AS ENUM ('PERCENT_COMPLETE', 'PHYSICAL', 'UNITS');

-- CreateTable
CREATE TABLE "project_calendars" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "working_week" JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
    "holidays" JSONB NOT NULL DEFAULT '[]',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "project_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "wbs_node_id" UUID,
    "calendar_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "activity_type" "activity_type" NOT NULL DEFAULT 'TASK',
    "duration" INTEGER NOT NULL DEFAULT 1,
    "planned_start" DATE,
    "planned_finish" DATE,
    "actual_start" DATE,
    "actual_finish" DATE,
    "forecast_start" DATE,
    "forecast_finish" DATE,
    "progress_method" "progress_method" NOT NULL DEFAULT 'PERCENT_COMPLETE',
    "physical_progress" INTEGER NOT NULL DEFAULT 0,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "totalFloat" INTEGER,
    "status" "activity_status" NOT NULL DEFAULT 'NOT_STARTED',
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "schedule_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_dependencies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "predecessor_id" UUID NOT NULL,
    "successor_id" UUID NOT NULL,
    "type" "dependency_type" NOT NULL DEFAULT 'FS',
    "lag" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "schedule_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_calendars_organization_id_project_id_idx" ON "project_calendars"("organization_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_calendars_organization_id_code_key" ON "project_calendars"("organization_id", "code");

-- CreateIndex
CREATE INDEX "schedule_activities_organization_id_project_id_idx" ON "schedule_activities"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "schedule_activities_organization_id_project_id_order_index_idx" ON "schedule_activities"("organization_id", "project_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_activities_project_id_code_key" ON "schedule_activities"("project_id", "code");

-- CreateIndex
CREATE INDEX "schedule_dependencies_organization_id_project_id_idx" ON "schedule_dependencies"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "schedule_dependencies_successor_id_idx" ON "schedule_dependencies"("successor_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_dependencies_predecessor_id_successor_id_key" ON "schedule_dependencies"("predecessor_id", "successor_id");

-- AddForeignKey
ALTER TABLE "project_calendars" ADD CONSTRAINT "project_calendars_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_calendars" ADD CONSTRAINT "project_calendars_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_activities" ADD CONSTRAINT "schedule_activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_activities" ADD CONSTRAINT "schedule_activities_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_activities" ADD CONSTRAINT "schedule_activities_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "project_calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_dependencies" ADD CONSTRAINT "schedule_dependencies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_dependencies" ADD CONSTRAINT "schedule_dependencies_predecessor_id_fkey" FOREIGN KEY ("predecessor_id") REFERENCES "schedule_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_dependencies" ADD CONSTRAINT "schedule_dependencies_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "schedule_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
