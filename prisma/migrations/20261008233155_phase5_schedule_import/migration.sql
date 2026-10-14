-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "source_format" VARCHAR(8) NOT NULL,
    "source_filename" VARCHAR(200),
    "activity_count" INTEGER NOT NULL DEFAULT 0,
    "dependency_count" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_templates_organization_id_name_idx" ON "schedule_templates"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_templates_organization_id_code_key" ON "schedule_templates"("organization_id", "code");

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
