-- CreateTable
CREATE TABLE "moderation_events" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "user_id" TEXT,
    "kind" TEXT NOT NULL,
    "field" TEXT,
    "decision" TEXT NOT NULL,
    "relevance_score" DOUBLE PRECISION,
    "nsfw_score" DOUBLE PRECISION,
    "labels" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_events_entity_type_entity_id_idx" ON "moderation_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "moderation_events_entity_type_decision_idx" ON "moderation_events"("entity_type", "decision");

-- CreateIndex
CREATE INDEX "moderation_events_user_id_idx" ON "moderation_events"("user_id");

-- CreateIndex
CREATE INDEX "moderation_events_created_at_idx" ON "moderation_events"("created_at");
