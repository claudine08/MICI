ALTER TABLE "supplier_rfi_recipients" ADD COLUMN "response_token" VARCHAR(64);
CREATE UNIQUE INDEX "supplier_rfi_recipients_response_token_key" ON "supplier_rfi_recipients"("response_token");