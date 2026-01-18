-- CreateTable
CREATE TABLE "collection_likes" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collection_likes_collection_id_idx" ON "collection_likes"("collection_id");

-- CreateIndex
CREATE INDEX "collection_likes_user_id_idx" ON "collection_likes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_likes_collection_id_user_id_key" ON "collection_likes"("collection_id", "user_id");

-- AddForeignKey
ALTER TABLE "collection_likes" ADD CONSTRAINT "collection_likes_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_likes" ADD CONSTRAINT "collection_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
