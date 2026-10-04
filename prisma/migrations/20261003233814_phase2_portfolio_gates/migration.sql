-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('DRAFT', 'QUALIFICATION', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "gate_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WAIVED');

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(32),
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "address" VARCHAR(300),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "project_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "client_id" UUID,
    "project_type" VARCHAR(64),
    "location" VARCHAR(300),
    "status" "project_status" NOT NULL DEFAULT 'DRAFT',
    "current_phase" VARCHAR(8) NOT NULL DEFAULT 'F0',
    "project_template_id" UUID,
    "project_manager_id" UUID,
    "sponsor_id" UUID,
    "start_date" DATE,
    "planned_end_date" DATE,
    "contract_end_date" DATE,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "contract_value" DECIMAL(18,2),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_definitions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "phase" VARCHAR(8) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "requires_evidence" BOOLEAN NOT NULL DEFAULT true,
    "minimum_approvals" INTEGER NOT NULL DEFAULT 1,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "gate_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_criteria" (
    "id" UUID NOT NULL,
    "gate_definition_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_instances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "gate_definition_id" UUID NOT NULL,
    "status" "gate_status" NOT NULL DEFAULT 'NOT_STARTED',
    "criteria_snapshot" JSONB NOT NULL DEFAULT '[]',
    "decision" VARCHAR(16),
    "decision_reason" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "gate_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_criterion_results" (
    "id" UUID NOT NULL,
    "gate_instance_id" UUID NOT NULL,
    "criterion_code" VARCHAR(32) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_criterion_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_evidences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "gate_instance_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "url" VARCHAR(500),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_approvals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "gate_instance_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "decision" VARCHAR(16) NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_organization_id_name_idx" ON "clients"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "clients_organization_id_code_key" ON "clients"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "project_templates_organization_id_code_key" ON "project_templates"("organization_id", "code");

-- CreateIndex
CREATE INDEX "projects_organization_id_status_idx" ON "projects"("organization_id", "status");

-- CreateIndex
CREATE INDEX "projects_organization_id_client_id_idx" ON "projects"("organization_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_code_key" ON "projects"("organization_id", "code");

-- CreateIndex
CREATE INDEX "gate_definitions_organization_id_phase_idx" ON "gate_definitions"("organization_id", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "gate_criteria_gate_definition_id_code_key" ON "gate_criteria"("gate_definition_id", "code");

-- CreateIndex
CREATE INDEX "gate_instances_organization_id_status_idx" ON "gate_instances"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gate_instances_project_id_gate_definition_id_key" ON "gate_instances"("project_id", "gate_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "gate_criterion_results_gate_instance_id_criterion_code_key" ON "gate_criterion_results"("gate_instance_id", "criterion_code");

-- CreateIndex
CREATE INDEX "gate_evidences_gate_instance_id_idx" ON "gate_evidences"("gate_instance_id");

-- CreateIndex
CREATE INDEX "gate_approvals_gate_instance_id_idx" ON "gate_approvals"("gate_instance_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_template_id_fkey" FOREIGN KEY ("project_template_id") REFERENCES "project_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_definitions" ADD CONSTRAINT "gate_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_criteria" ADD CONSTRAINT "gate_criteria_gate_definition_id_fkey" FOREIGN KEY ("gate_definition_id") REFERENCES "gate_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_instances" ADD CONSTRAINT "gate_instances_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_instances" ADD CONSTRAINT "gate_instances_gate_definition_id_fkey" FOREIGN KEY ("gate_definition_id") REFERENCES "gate_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_criterion_results" ADD CONSTRAINT "gate_criterion_results_gate_instance_id_fkey" FOREIGN KEY ("gate_instance_id") REFERENCES "gate_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_evidences" ADD CONSTRAINT "gate_evidences_gate_instance_id_fkey" FOREIGN KEY ("gate_instance_id") REFERENCES "gate_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_approvals" ADD CONSTRAINT "gate_approvals_gate_instance_id_fkey" FOREIGN KEY ("gate_instance_id") REFERENCES "gate_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
