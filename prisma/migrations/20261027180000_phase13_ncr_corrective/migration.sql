-- CreateEnum
CREATE TYPE "non_conformity_status" AS ENUM ('OPEN', 'CORRECTION', 'VERIFICATION', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "corrective_action_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'VERIFIED', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "non_conformities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "non_conformity_status" NOT NULL DEFAULT 'OPEN',
    "inspection_id" UUID,
    "correction_notes" TEXT,
    "verification_notes" TEXT,
    "cancel_reason" VARCHAR(1000),
    "corrected_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "non_conformities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrective_actions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "corrective_action_status" NOT NULL DEFAULT 'OPEN',
    "non_conformity_id" UUID NOT NULL,
    "responsible_id" UUID,
    "due_date" DATE,
    "action_notes" TEXT,
    "verification_notes" TEXT,
    "cancel_reason" VARCHAR(1000),
    "completed_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "non_conformities_organization_id_project_id_idx" ON "non_conformities"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "non_conformities_organization_id_project_id_status_idx" ON "non_conformities"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "non_conformities_organization_id_inspection_id_idx" ON "non_conformities"("organization_id", "inspection_id");

-- CreateIndex
CREATE UNIQUE INDEX "non_conformities_project_id_code_key" ON "non_conformities"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "non_conformities_project_id_client_uuid_key" ON "non_conformities"("project_id", "client_uuid");

-- CreateIndex
CREATE INDEX "corrective_actions_organization_id_project_id_idx" ON "corrective_actions"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "corrective_actions_organization_id_project_id_status_idx" ON "corrective_actions"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "corrective_actions_organization_id_non_conformity_id_idx" ON "corrective_actions"("organization_id", "non_conformity_id");

-- CreateIndex
CREATE UNIQUE INDEX "corrective_actions_project_id_code_key" ON "corrective_actions"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "corrective_actions_project_id_client_uuid_key" ON "corrective_actions"("project_id", "client_uuid");

-- AddForeignKey
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_non_conformity_id_fkey" FOREIGN KEY ("non_conformity_id") REFERENCES "non_conformities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
