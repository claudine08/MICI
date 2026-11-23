-- AlterTable
ALTER TABLE "gate_evidences" ADD COLUMN     "content" BYTEA,
ADD COLUMN     "file_hash" VARCHAR(64),
ADD COLUMN     "file_name" VARCHAR(255),
ADD COLUMN     "mime_type" VARCHAR(128),
ADD COLUMN     "size_bytes" INTEGER;

-- AlterTable
ALTER TABLE "requirement_evidences" ADD COLUMN     "content" BYTEA,
ADD COLUMN     "file_hash" VARCHAR(64),
ADD COLUMN     "file_name" VARCHAR(255),
ADD COLUMN     "mime_type" VARCHAR(128),
ADD COLUMN     "size_bytes" INTEGER;
