-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('SCOPE', 'SCHEDULE', 'COST', 'QUALITY', 'SAFETY', 'SUPPLY', 'CONTRACTUAL', 'REGULATORY', 'ENVIRONMENTAL', 'SUSTAINABILITY');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('IDENTIFIED', 'ANALYZED', 'PLANNED', 'TREATING', 'MONITORING', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RiskResponseStrategy" AS ENUM ('AVOID', 'MITIGATE', 'TRANSFER', 'ACCEPT', 'ESCALATE');

-- CreateTable
CREATE TABLE "risk_matrix_configs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "probability_labels" JSONB NOT NULL DEFAULT '["Muito baixa","Baixa","Média","Alta","Muito alta"]',
    "impact_labels" JSONB NOT NULL DEFAULT '["Irrelevante","Menor","Moderado","Maior","Crítico"]',
    "low_max" INTEGER NOT NULL DEFAULT 4,
    "medium_max" INTEGER NOT NULL DEFAULT 9,
    "high_max" INTEGER NOT NULL DEFAULT 16,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "risk_matrix_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "cause" TEXT,
    "event" TEXT,
    "effect" TEXT,
    "category" "RiskCategory" NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 1,
    "impact" INTEGER NOT NULL DEFAULT 1,
    "exposure" INTEGER NOT NULL DEFAULT 1,
    "owner_id" UUID,
    "response" "RiskResponseStrategy",
    "action" TEXT,
    "due_date" DATE,
    "status" "RiskStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "residual_probability" INTEGER,
    "residual_impact" INTEGER,
    "residual_exposure" INTEGER,
    "residual_notes" TEXT,
    "wbs_node_id" UUID,
    "activity_id" UUID,
    "cost_item_id" UUID,
    "analyzed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_responses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "risk_id" UUID NOT NULL,
    "strategy" "RiskResponseStrategy" NOT NULL,
    "action" TEXT,
    "owner_id" UUID,
    "due_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "risk_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "risk_matrix_configs_organization_id_key" ON "risk_matrix_configs"("organization_id");

-- CreateIndex
CREATE INDEX "risks_organization_id_project_id_idx" ON "risks"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "risks_organization_id_project_id_status_idx" ON "risks"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "risks_organization_id_project_id_category_idx" ON "risks"("organization_id", "project_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "risks_project_id_code_key" ON "risks"("project_id", "code");

-- CreateIndex
CREATE INDEX "risk_responses_organization_id_risk_id_idx" ON "risk_responses"("organization_id", "risk_id");

-- CreateIndex
CREATE INDEX "risk_responses_organization_id_project_id_idx" ON "risk_responses"("organization_id", "project_id");

-- AddForeignKey
ALTER TABLE "risk_matrix_configs" ADD CONSTRAINT "risk_matrix_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_cost_item_id_fkey" FOREIGN KEY ("cost_item_id") REFERENCES "cost_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_responses" ADD CONSTRAINT "risk_responses_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_responses" ADD CONSTRAINT "risk_responses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
