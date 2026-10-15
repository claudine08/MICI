-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('WIP', 'FOR_REVIEW', 'APPROVED', 'RELEASED_FOR_EXECUTION', 'OBSOLETE');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "discipline" VARCHAR(64),
    "classification" VARCHAR(64),
    "status" "document_status" NOT NULL DEFAULT 'WIP',
    "current_revision" INTEGER NOT NULL DEFAULT 1,
    "effective_date" DATE,
    "expiry_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(127) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "content" BYTEA NOT NULL,
    "reason" VARCHAR(300),
    "status" "document_status" NOT NULL DEFAULT 'WIP',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "approval_comment" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "document_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_approvals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "document_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_type" VARCHAR(32) NOT NULL,
    "source_id" UUID NOT NULL,
    "target_type" VARCHAR(32) NOT NULL,
    "target_id" UUID NOT NULL,
    "relation_type" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_organization_id_project_id_idx" ON "documents"("organization_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_project_id_code_key" ON "documents"("project_id", "code");

-- CreateIndex
CREATE INDEX "document_revisions_organization_id_document_id_idx" ON "document_revisions"("organization_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_revisions_document_id_revision_key" ON "document_revisions"("document_id", "revision");

-- CreateIndex
CREATE INDEX "document_approvals_organization_id_document_id_idx" ON "document_approvals"("organization_id", "document_id");

-- CreateIndex
CREATE INDEX "document_links_organization_id_source_type_source_id_idx" ON "document_links"("organization_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "document_links_organization_id_target_type_target_id_idx" ON "document_links"("organization_id", "target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_links_organization_id_source_type_source_id_target_key" ON "document_links"("organization_id", "source_type", "source_id", "target_type", "target_id", "relation_type");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_approvals" ADD CONSTRAINT "document_approvals_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_approvals" ADD CONSTRAINT "document_approvals_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "document_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
