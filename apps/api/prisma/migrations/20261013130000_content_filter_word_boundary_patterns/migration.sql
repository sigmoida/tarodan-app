-- İçerik filtresi: WhatsApp / Instagram kalıplarını Türkçe kelime sınırlı
-- sürüme taşır (veri göçü, şema değişikliği yok).
--
-- Eski seed kalıpları kelime sınırsızdı ("Big Rig", "MiG 29" Instagram'dan,
-- "Kawasaki 1" WhatsApp'tan eşleşiyor, hepsi requiresApproval olduğundan
-- meşru teklif/takas notları reddediliyordu). Yeni kalıplar
-- `src/common/helpers/contact-patterns.ts` ile birebir aynıdır; seed.ts yalnız
-- boş veritabanını ve yeniden seed'i düzeltiyordu, yaşayan satırlar eski
-- kalıpta kalıyordu (filtre kuralları çalışma anında DB'den okunur).
--
-- CANLI VERİ GÜVENLİĞİ: yalnız seed'in kendi satırları ve yalnız kalıbı eski
-- seed değeriyle BİREBİR aynı olanlar güncellenir. Yönetici bir kalıbı
-- değiştirdiyse (ya da satırı sildi/pasife aldıysa) o satıra dokunulmaz;
-- göç tekrar çalışsa da no-op'tur. Başka tablo/kolon değişmez.
-- GERİ ALMA: aşağıdaki iki UPDATE'in SET/WHERE kalıplarını yer değiştirerek
-- çalıştırmak yeterlidir.
UPDATE "content_filters"
SET "pattern" = $new$(?<![A-Za-z0-9ÇçĞğİıÖöŞşÜüÂâÎîÛû])(?:whatsapp|wp|wa|w\s*a)(?![A-Za-zÇçĞğİıÖöŞşÜüÂâÎîÛû])[\s:]*[\d+()-]+$new$,
    "updated_at" = NOW()
WHERE "id" = 'whatsapp-filter'
  AND "pattern" = $old$(whatsapp|wp|wa)[\s:]*[\d+()-]+$old$;

UPDATE "content_filters"
SET "pattern" = $new$(?<![A-Za-z0-9ÇçĞğİıÖöŞşÜüÂâÎîÛû])(?:instagram|insta|ig)(?![A-Za-zÇçĞğİıÖöŞşÜüÂâÎîÛû])[:\s@]+[A-Za-z0-9_.]+$new$,
    "updated_at" = NOW()
WHERE "id" = 'instagram-filter'
  AND "pattern" = $old$(instagram|ig|insta)[:\s@]+[a-zA-Z0-9_.]+$old$;
