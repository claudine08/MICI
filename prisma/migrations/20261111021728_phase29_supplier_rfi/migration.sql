-- CreateEnum
CREATE TYPE "SupplierRfiStatus" AS ENUM ('DRAFT', 'SENT', 'RESPONDED', 'SELECTED', 'CONVERTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "supplier_rfis" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "SupplierRfiStatus" NOT NULL DEFAULT 'DRAFT',
    "due_date" DATE,
    "selected_supplier_id" UUID,
    "converted_quotation_id" UUID,
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "supplier_rfis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_rfi_recipients" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "rfi_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "quoted_amount" DECIMAL(14,2),
    "lead_time_days" INTEGER,
    "notes" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "supplier_rfi_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_rfis_organization_id_project_id_idx" ON "supplier_rfis"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "supplier_rfis_organization_id_status_idx" ON "supplier_rfis"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_rfis_project_id_code_key" ON "supplier_rfis"("project_id", "code");

-- CreateIndex
CREATE INDEX "supplier_rfi_recipients_organization_id_rfi_id_idx" ON "supplier_rfi_recipients"("organization_id", "rfi_id");

-- CreateIndex
CREATE INDEX "supplier_rfi_recipients_organization_id_supplier_id_idx" ON "supplier_rfi_recipients"("organization_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_rfi_recipients_rfi_id_supplier_id_key" ON "supplier_rfi_recipients"("rfi_id", "supplier_id");

-- AddForeignKey
ALTER TABLE "supplier_rfis" ADD CONSTRAINT "supplier_rfis_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rfis" ADD CONSTRAINT "supplier_rfis_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rfi_recipients" ADD CONSTRAINT "supplier_rfi_recipients_rfi_id_fkey" FOREIGN KEY ("rfi_id") REFERENCES "supplier_rfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rfi_recipients" ADD CONSTRAINT "supplier_rfi_recipients_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rfi_recipients" ADD CONSTRAINT "supplier_rfi_recipients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
