CREATE TABLE "verification_documents" (
  "verification_request_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "purge_after" TIMESTAMP(3),
  "purged_at" TIMESTAMP(3),
  CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("verification_request_id", "document_id")
);

CREATE UNIQUE INDEX "verification_documents_document_id_key"
  ON "verification_documents"("document_id");
CREATE INDEX "verification_documents_purge_after_purged_at_idx"
  ON "verification_documents"("purge_after", "purged_at");

ALTER TABLE "verification_documents"
  ADD CONSTRAINT "verification_documents_verification_request_id_fkey"
  FOREIGN KEY ("verification_request_id") REFERENCES "verification_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verification_documents"
  ADD CONSTRAINT "verification_documents_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
