-- CreateEnum
CREATE TYPE "RfiStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "rfis" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "question" TEXT NOT NULL,
    "recipient_id" UUID,
    "due_date" DATE,
    "status" "RfiStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "responded_by" UUID,
    "responded_at" TIMESTAMP(3),
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "requirement_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "rfis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rfis_organization_id_project_id_idx" ON "rfis"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "rfis_organization_id_status_idx" ON "rfis"("organization_id", "status");

-- CreateIndex
CREATE INDEX "rfis_organization_id_recipient_id_idx" ON "rfis"("organization_id", "recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfis_project_id_code_key" ON "rfis"("project_id", "code");

-- AddForeignKey
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
