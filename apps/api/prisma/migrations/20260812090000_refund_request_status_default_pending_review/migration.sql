-- O9: RefundRequest.status varsayılanı `approved` idi — status'u unutan her
-- insert doğrudan para taahhüt eden AKTİF bir duruma düşüyordu. Varsayılan
-- güvenli tarafa çekildi: incelemeye düşer, otomatik onaya değil. Otomatik
-- onaylı yollar (anında iade, cayma hakkı) status'u zaten açıkça yazar.
ALTER TABLE "refund_requests"
  ALTER COLUMN "status" SET DEFAULT 'pending_review';
