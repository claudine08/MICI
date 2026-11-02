
-- CreateTable
CREATE TABLE "ai_prompts" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "template" TEXT NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "prompt_code" VARCHAR(64) NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT,
    "model" VARCHAR(120) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "error_message" TEXT,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_prompts_organization_id_idx" ON "ai_prompts"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompts_organization_id_code_key" ON "ai_prompts"("organization_id", "code");

-- CreateIndex
CREATE INDEX "ai_requests_organization_id_project_id_idx" ON "ai_requests"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "ai_requests_organization_id_created_at_idx" ON "ai_requests"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

