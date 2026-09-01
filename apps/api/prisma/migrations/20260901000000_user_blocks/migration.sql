-- Kullanıcı engelleme kalıcı hâle geliyor (Apple App Review şartı). Önceden
-- süreç içi Map'te tutuluyordu; yeniden başlatmada siliniyor ve replikalar
-- arasında paylaşılmıyordu. Engel simetrik uygulanır; `reason` yalnız admin'e.
CREATE TABLE "user_blocks" (
    "id" TEXT NOT NULL,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_blocks_blocker_id_blocked_id_key"
ON "user_blocks"("blocker_id", "blocked_id");

CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");

ALTER TABLE "user_blocks"
  ADD CONSTRAINT "user_blocks_blocker_id_fkey"
  FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_blocks"
  ADD CONSTRAINT "user_blocks_blocked_id_fkey"
  FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
