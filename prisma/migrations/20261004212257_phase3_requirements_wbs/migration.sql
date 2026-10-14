-- CreateEnum
CREATE TYPE "requirement_category" AS ENUM ('OPERATION', 'EQUIPMENT', 'BUILDING', 'ENGINEERING', 'COMPLIANCE', 'SUSTAINABILITY');

-- CreateEnum
CREATE TYPE "requirement_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "requirement_status" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "wbs_node_type" AS ENUM ('SUMMARY', 'DELIVERABLE', 'WORK_PACKAGE');

-- CreateEnum
CREATE TYPE "wbs_version_source" AS ENUM ('MANUAL', 'IMPORT');

-- CreateTable
CREATE TABLE "requirements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "requirement_category" NOT NULL DEFAULT 'OPERATION',
    "source" VARCHAR(300),
    "source_valid_until" DATE,
    "priority" "requirement_priority" NOT NULL DEFAULT 'MEDIUM',
    "owner_id" UUID,
    "acceptance_criteria" TEXT,
    "required_evidence" TEXT,
    "status" "requirement_status" NOT NULL DEFAULT 'DRAFT',
    "wbs_node_id" UUID,
    "document_links" JSONB NOT NULL DEFAULT '[]',
    "last_reviewed_at" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "change_summary" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "requirement_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_evidences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "url" VARCHAR(500),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_nodes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "node_type" "wbs_node_type" NOT NULL DEFAULT 'WORK_PACKAGE',
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "wbs_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "wbs_version_source" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "snapshot" JSONB NOT NULL,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "wbs_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirements_organization_id_project_id_idx" ON "requirements"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "requirements_organization_id_status_idx" ON "requirements"("organization_id", "status");

-- CreateIndex
CREATE INDEX "requirements_organization_id_wbs_node_id_idx" ON "requirements"("organization_id", "wbs_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirements_project_id_code_key" ON "requirements"("project_id", "code");

-- CreateIndex
CREATE INDEX "requirement_revisions_organization_id_created_at_idx" ON "requirement_revisions"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_revisions_requirement_id_revision_key" ON "requirement_revisions"("requirement_id", "revision");

-- CreateIndex
CREATE INDEX "requirement_evidences_requirement_id_idx" ON "requirement_evidences"("requirement_id");

-- CreateIndex
CREATE INDEX "wbs_nodes_organization_id_project_id_parent_id_idx" ON "wbs_nodes"("organization_id", "project_id", "parent_id");

-- CreateIndex
CREATE INDEX "wbs_nodes_organization_id_project_id_order_index_idx" ON "wbs_nodes"("organization_id", "project_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "wbs_nodes_project_id_code_key" ON "wbs_nodes"("project_id", "code");

-- CreateIndex
CREATE INDEX "wbs_versions_organization_id_project_id_idx" ON "wbs_versions"("organization_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "wbs_versions_project_id_version_key" ON "wbs_versions"("project_id", "version");

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_revisions" ADD CONSTRAINT "requirement_revisions_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_evidences" ADD CONSTRAINT "requirement_evidences_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_nodes" ADD CONSTRAINT "wbs_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_nodes" ADD CONSTRAINT "wbs_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "wbs_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_versions" ADD CONSTRAINT "wbs_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
