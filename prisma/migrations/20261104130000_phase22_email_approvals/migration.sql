-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "object_type" VARCHAR(64) NOT NULL,
    "object_id" UUID NOT NULL,
    "approver_email" VARCHAR(320) NOT NULL,
    "token" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "decision_comment" TEXT,
    "decided_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_token_key" ON "approval_requests"("token");
CREATE INDEX "approval_requests_organization_id_idx" ON "approval_requests"("organization_id");
CREATE INDEX "approval_requests_token_idx" ON "approval_requests"("token");
CREATE INDEX "approval_requests_status_expires_at_idx" ON "approval_requests"("status", "expires_at");