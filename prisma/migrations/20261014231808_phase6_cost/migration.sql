-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "cost_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "wbs_node_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "unit" VARCHAR(16) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "origin" VARCHAR(32),
    "fonte_preco" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_commitments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "cost_item_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "supplier" VARCHAR(200),
    "amount" DECIMAL(18,2) NOT NULL,
    "committed_at" DATE NOT NULL,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "cost_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_actuals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "cost_item_id" UUID,
    "commitment_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "incurred_at" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "cost_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_items_organization_id_project_id_idx" ON "cost_items"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "cost_items_organization_id_wbs_node_id_idx" ON "cost_items"("organization_id", "wbs_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_items_project_id_code_key" ON "cost_items"("project_id", "code");

-- CreateIndex
CREATE INDEX "cost_commitments_organization_id_project_id_idx" ON "cost_commitments"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "cost_commitments_organization_id_project_id_status_idx" ON "cost_commitments"("organization_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cost_commitments_project_id_code_key" ON "cost_commitments"("project_id", "code");

-- CreateIndex
CREATE INDEX "cost_actuals_organization_id_project_id_idx" ON "cost_actuals"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "cost_actuals_organization_id_project_id_incurred_at_idx" ON "cost_actuals"("organization_id", "project_id", "incurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "cost_actuals_project_id_code_key" ON "cost_actuals"("project_id", "code");

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_commitments" ADD CONSTRAINT "cost_commitments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_commitments" ADD CONSTRAINT "cost_commitments_cost_item_id_fkey" FOREIGN KEY ("cost_item_id") REFERENCES "cost_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_actuals" ADD CONSTRAINT "cost_actuals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_actuals" ADD CONSTRAINT "cost_actuals_cost_item_id_fkey" FOREIGN KEY ("cost_item_id") REFERENCES "cost_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_actuals" ADD CONSTRAINT "cost_actuals_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "cost_commitments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
