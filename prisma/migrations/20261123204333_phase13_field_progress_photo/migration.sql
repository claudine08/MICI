-- AlterTable
ALTER TABLE "photo_evidence" ADD COLUMN     "progress_measurement_id" UUID;

-- AddForeignKey
ALTER TABLE "photo_evidence" ADD CONSTRAINT "photo_evidence_progress_measurement_id_fkey" FOREIGN KEY ("progress_measurement_id") REFERENCES "progress_measurements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
