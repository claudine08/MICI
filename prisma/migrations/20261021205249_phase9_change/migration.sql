-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IMPACT_ANALYSIS', 'WAITING_APPROVAL', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'VERIFIED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChangeCategory" AS ENUM ('SCOPE', 'SCHEDULE', 'COST', 'QUALITY', 'RISK', 'CONTRACT', 'DOCUMENT', 'OPERATION', 'REGULATORY', 'ENVIRONMENTAL', 'SUSTAINABILITY');

-- CreateEnum
CREATE TYPE "ImpactDimension" AS ENUM ('SCOPE', 'COST', 'SCHEDULE', 'QUALITY', 'RISK', 'CONTRACT', 'DOCUMENT', 'OPERATION', 'REGULATORY', 'ENVIRONMENTAL', 'SUSTAINABILITY');

-- CreateEnum
CREATE TYPE "ImpactSeverity" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ChangeApprovalAction" AS ENUM ('APPROVE', 'REJECT');

-- AlterTable
ALTER TABLE "baselines" ADD COLUMN     "change_request_id" UUID;

-- CreateTable
CREATE TABLE "change_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "justification" TEXT,
    "category" "ChangeCategory" NOT NULL DEFAULT 'SCOPE',
    "status" "ChangeStatus" NOT NULL DEFAULT 'DRAFT',
    "owner_id" UUID,
    "requested_by_id" UUID NOT NULL,
    "due_date" DATE,
    "cost_delta" DECIMAL(18,2),
    "schedule_days" INTEGER,
    "implementation_notes" TEXT,
    "reject_reason" TEXT,
    "cancel_reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "implemented_at" TIMESTAMP(3),
    "implemented_by" UUID,
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_impacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "change_id" UUID NOT NULL,
    "dimension" "ImpactDimension" NOT NULL,
    "severity" "ImpactSeverity" NOT NULL DEFAULT 'NONE',
    "notes" TEXT,
    "assessed_by_id" UUID,
    "assessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "change_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_approvals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "change_id" UUID NOT NULL,
    "action" "ChangeApprovalAction" NOT NULL,
    "comment" TEXT,
    "approver_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_requests_organization_id_project_id_idx" ON "change_requests"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "change_requests_organization_id_project_id_status_idx" ON "change_requests"("organization_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "change_requests_project_id_code_key" ON "change_requests"("project_id", "code");

-- CreateIndex
CREATE INDEX "change_impacts_organization_id_project_id_idx" ON "change_impacts"("organization_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "change_impacts_change_id_dimension_key" ON "change_impacts"("change_id", "dimension");

-- CreateIndex
CREATE INDEX "change_approvals_organization_id_change_id_idx" ON "change_approvals"("organization_id", "change_id");

-- CreateIndex
CREATE INDEX "change_approvals_organization_id_project_id_idx" ON "change_approvals"("organization_id", "project_id");

-- AddForeignKey
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_impacts" ADD CONSTRAINT "change_impacts_change_id_fkey" FOREIGN KEY ("change_id") REFERENCES "change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_approvals" ADD CONSTRAINT "change_approvals_change_id_fkey" FOREIGN KEY ("change_id") REFERENCES "change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_approvals" ADD CONSTRAINT "change_approvals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
