-- CreateTable
CREATE TABLE "featured_snapshots" (
    "type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "featured_snapshots_pkey" PRIMARY KEY ("type")
);
