-- Platform (admin) takas iptalinin katalog kodu (@tarodan/types →
-- ADMIN_CANCEL_REASON_CODES). Admin ekranları iptal nedenini bu koddan gösterir
-- ve filtreler; taraflara kodun etiketi gider, adminin iç notu yalnız denetim
-- kaydındadır.
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Boş (NULL) kolon, varsayılan ve geri
-- doldurma YOK — NULL "platform iptali değil" demektir, mevcut takasların
-- davranışı bu göçle değişmez.
ALTER TABLE "trades" ADD COLUMN "admin_cancel_reason_code" TEXT;
