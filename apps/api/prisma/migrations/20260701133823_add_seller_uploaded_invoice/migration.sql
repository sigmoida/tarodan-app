-- CreateTable
CREATE TABLE "seller_uploaded_invoices" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "pdf_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER,
    "email_sent_at" TIMESTAMP(3),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replaced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_uploaded_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_uploaded_invoices_order_id_key" ON "seller_uploaded_invoices"("order_id");

-- CreateIndex
CREATE INDEX "seller_uploaded_invoices_seller_id_idx" ON "seller_uploaded_invoices"("seller_id");

-- CreateIndex
CREATE INDEX "seller_uploaded_invoices_buyer_id_idx" ON "seller_uploaded_invoices"("buyer_id");

-- AddForeignKey
ALTER TABLE "seller_uploaded_invoices" ADD CONSTRAINT "seller_uploaded_invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
