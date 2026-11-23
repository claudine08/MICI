-- AlterTable
ALTER TABLE "photo_evidence" ADD COLUMN     "task_id" UUID;

-- AddForeignKey
ALTER TABLE "photo_evidence" ADD CONSTRAINT "photo_evidence_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "field_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
