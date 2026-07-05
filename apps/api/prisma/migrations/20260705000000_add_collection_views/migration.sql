-- CreateTable
CREATE TABLE "collection_views" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collection_views_collection_id_idx" ON "collection_views"("collection_id");

-- CreateIndex
CREATE INDEX "collection_views_user_id_idx" ON "collection_views"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_views_collection_id_user_id_key" ON "collection_views"("collection_id", "user_id");

-- AddForeignKey
ALTER TABLE "collection_views" ADD CONSTRAINT "collection_views_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_views" ADD CONSTRAINT "collection_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
