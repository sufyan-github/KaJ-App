CREATE TABLE "portfolio_items" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "user_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "caption" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portfolio_items_document_id_key" ON "portfolio_items"("document_id");
CREATE INDEX "portfolio_items_user_id_sort_order_created_at_idx" ON "portfolio_items"("user_id", "sort_order", "created_at");
CREATE INDEX "portfolio_items_category_id_idx" ON "portfolio_items"("category_id");

ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
