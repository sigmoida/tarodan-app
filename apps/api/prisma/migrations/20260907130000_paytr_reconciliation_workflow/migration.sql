-- PSP mutabakatı: üyelik ödemeleri (MembershipPayment) döküm satırlarıyla eşlenir,
-- eşleştirme motoru kalıcı karşılıksız satırlarda tıkanmaz (son deneme damgası),
-- sorunlu satırlar admin tarafından çözümlenip iş listesinden düşürülebilir,
-- hakediş kalemleri boş dönse bile bir kez çekilir.
ALTER TABLE "paytr_statement_lines"
  ADD COLUMN "membership_payment_id" TEXT,
  ADD COLUMN "last_match_attempt_at" TIMESTAMP(3),
  ADD COLUMN "resolved_at" TIMESTAMP(3),
  ADD COLUMN "resolved_by_id" TEXT,
  ADD COLUMN "resolution_note" TEXT;

CREATE INDEX "paytr_statement_lines_match_status_last_match_attempt_at_idx"
  ON "paytr_statement_lines"("match_status", "last_match_attempt_at");
CREATE INDEX "paytr_statement_lines_membership_payment_id_idx"
  ON "paytr_statement_lines"("membership_payment_id");

ALTER TABLE "paytr_settlements" ADD COLUMN "items_synced_at" TIMESTAMP(3);
-- Kalemi zaten çekilmiş hakedişler yeniden istenmesin.
UPDATE "paytr_settlements" s SET "items_synced_at" = s."updated_at"
  WHERE EXISTS (SELECT 1 FROM "paytr_settlement_items" i WHERE i."settlement_id" = s."id");
