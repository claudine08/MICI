CREATE TYPE "execution_source" AS ENUM ('CAMPO', 'ESCRITORIO', 'SUPRIMENTOS', 'OUTRO');
ALTER TABLE "schedule_activities" ADD COLUMN "execution_source" "execution_source" NOT NULL DEFAULT 'ESCRITORIO';
