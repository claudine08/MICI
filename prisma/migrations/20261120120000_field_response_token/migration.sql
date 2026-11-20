-- CreateTable
CREATE TABLE "FieldResponseToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "FieldResponseToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldResponseToken_token_key" ON "FieldResponseToken"("token");

-- CreateIndex
CREATE INDEX "FieldResponseToken_token_idx" ON "FieldResponseToken"("token");

-- CreateIndex
CREATE INDEX "FieldResponseToken_entityType_entityId_idx" ON "FieldResponseToken"("entityType", "entityId");