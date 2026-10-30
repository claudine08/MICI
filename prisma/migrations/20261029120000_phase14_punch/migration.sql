-- CreateEnum
CREATE TYPE "punch_item_status" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'READY_FOR_VERIFICATION', 'VERIFIED', 'REJECTED', 'CLOSED');

-- CreateTable
CREATE TABLE "punch_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "location" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "field_priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "punch_item_status" NOT NULL DEFAULT 'OPEN',
    "owner_id" UUID,
    "due_date" DATE,
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "photo_evidence_id" UUID,
    "correction_evidence_id" UUID,
    "verification_notes" TEXT,
    "reject_reason" VARCHAR(1000),
    "verified_by" UUID,
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

    CONSTRAINT "punch_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "punch_items_organization_id_project_id_idx" ON "punch_items"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "punch_items_organization_id_project_id_status_idx" ON "punch_items"("organization_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "punch_items_project_id_code_key" ON "punch_items"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "punch_items_project_id_client_uuid_key" ON "punch_items"("project_id", "client_uuid");

-- AddForeignKey
ALTER TABLE "punch_items" ADD CONSTRAINT "punch_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_items" ADD CONSTRAINT "punch_items_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_items" ADD CONSTRAINT "punch_items_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_items" ADD CONSTRAINT "punch_items_photo_evidence_id_fkey" FOREIGN KEY ("photo_evidence_id") REFERENCES "photo_evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_items" ADD CONSTRAINT "punch_items_correction_evidence_id_fkey" FOREIGN KEY ("correction_evidence_id") REFERENCES "photo_evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

