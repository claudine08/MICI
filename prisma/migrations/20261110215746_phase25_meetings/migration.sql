-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "webhook_deliveries_endpoint_id_fkey";

-- AlterTable
ALTER TABLE "approval_requests" ALTER COLUMN "decided_by_name" SET DATA TYPE TEXT,
ALTER COLUMN "decided_by_email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "risk_matrix_configs" ALTER COLUMN "probability_labels" SET DEFAULT '["Muito baixa","Baixa","MÃ©dia","Alta","Muito alta"]',
ALTER COLUMN "impact_labels" SET DEFAULT '["Irrelevante","Menor","Moderado","Maior","CrÃ­tico"]';

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "meeting_date" DATE NOT NULL,
    "location" VARCHAR(200),
    "attendees" JSONB NOT NULL DEFAULT '[]',
    "minutes" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_actions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "description" TEXT NOT NULL,
    "owner_id" UUID,
    "due_date" DATE,
    "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "requirement_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "meeting_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meetings_organization_id_project_id_idx" ON "meetings"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "meetings_organization_id_status_idx" ON "meetings"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_project_id_code_key" ON "meetings"("project_id", "code");

-- CreateIndex
CREATE INDEX "meeting_actions_organization_id_meeting_id_idx" ON "meeting_actions"("organization_id", "meeting_id");

-- CreateIndex
CREATE INDEX "meeting_actions_organization_id_owner_id_idx" ON "meeting_actions"("organization_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_actions_meeting_id_code_key" ON "meeting_actions"("meeting_id", "code");

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_actions" ADD CONSTRAINT "meeting_actions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_actions" ADD CONSTRAINT "meeting_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
