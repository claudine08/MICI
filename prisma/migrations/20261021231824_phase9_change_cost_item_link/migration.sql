-- AlterTable
ALTER TABLE "cost_items" ADD COLUMN     "change_request_id" UUID;

-- CreateIndex
CREATE INDEX "cost_items_project_id_change_request_id_idx" ON "cost_items"("project_id", "change_request_id");

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
