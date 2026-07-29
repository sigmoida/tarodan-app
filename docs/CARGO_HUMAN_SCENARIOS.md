# Kargo Süreci — İnsani Senaryo Kataloğu

> Teknik denetimin ([CARGO_AUDIT_FIXES.md](./CARGO_AUDIT_FIXES.md)) devamı: "insan ne yapar?"
> gözlüğüyle uçtan uca senaryolar. Durum: ✅ sistem karşılıyor · 🟡 kısmen · 🔴 boşluk.
> 🔴'lar kesin çözülür; 🟡'lar ucuz olduğunda (kod veya UX) çözülür, değilse not düşülür.

## A) Sipariş — Satıcı tarafı (paketi şubeye götüren insan)

| # | Senaryo | Durum | Sistem cevabı / karar |
|---|---------|-------|----------------------|
| A1 | Satıcı hiç kargolamaz | ✅ | preparing deadline uyarısı + `seller_no_ship` otomatik iptal/iade |
| A2 | Şubeye gitti ama kod henüz yok | 🟡→✅ | UI "hazırlanıyor" + retry; **eklendi:** kod retry ile dolunca satıcıya/gönderene `cargo_code_ready` bildirimi |
| A3 | Şubede yanlış numara söyler | 🟡 | UI yalnız gerçek kodu gösteriyor; **OPS:** şubenin `OzelKargoTakipNo` ile arayıp arayamadığı Sürat'a sorulacak |
| A4 | Sürat yerine başka kargo kullanır | 🟡 | Manuel picked_up var; takip yok — bilinçli (Sürat anlaşmalı taşıyıcı) |
| A5 | Birden çok siparişi TEK koliye koyar | 🔴→✅ | **UX:** satıcı kargo talimatına "her sipariş ayrı koli + ayrı kod" uyarısı eklendi |
| A6 | Ürün büyük/ağır (payload desi/kg=1) | 🔴→✅ | **UX+politika:** talimata "ücret Tarodan hesabından; şube ölçüm yapabilir, sizden ücret istenmez" eklendi. Sürat şubede gerçek desiyi ölçüp cari hesaba yansıtır — payload beyanı bağlayıcı değil. Aşırı boyut sınırları → ops sözleşme konusu |
| A7 | Satıcı adresi Sürat'ça reddediliyor | 🟡 | Backoff + 48s admin alarmı (audit M2); satıcıya özel bildirim şimdilik yok |
| A8 | Kargoyu verdikten sonra vazgeçer | ✅ | Kargolanmış sipariş iptal edilemez → iade akışı |
| A9 | "Kargoya verdim" der ama vermemiştir (manuel picked_up ile deadline atlatma) | 🔴→✅ | **Kod:** `picked_up` + Sürat'tan hiç veri yoksa (providerStatusCode null) N gün sonra (env `CARGO_PICKUP_NO_DATA_DAYS`, vars. 3) tek seferlik ERROR alarmı + satıcıya hatırlatma bildirimi |

## B) Sipariş — Alıcı/teslimat tarafı

| # | Senaryo | Durum | Sistem cevabı / karar |
|---|---------|-------|----------------------|
| B10 | Alıcı evde yok / reddeder | ✅ | Sürat iade kodları (9–16) → satıcıya dönüş → kod 12'de otomatik refund |
| B11 | Adres yanlış, kurye bulamıyor | 🟡 | Sonu iade akışı (✅); yoldayken adres düzeltme yok — ops/manuel (gelecek: admin aracı) |
| B12 | Komşu/kapıcı aldı, alıcı "almadım" diyor | 🟡 | `TeslimAlan` kayıtlı + 48h onay penceresi; kanıt tartışması admin'e |
| B13 | Kurye sahte "teslim edildi" bastı | 🟡 | 48h modunda yakalanır; escrow zaten teslim+14g bekliyor — para hemen gitmez |
| B14 | Hasarlı/yanlış ürün geldi | ✅ | Fotoğraf kanıtlı iade talebi + otomatik onay |
| B15 | Paket kargoda kayboldu | 🔴→✅ | **Kod:** hareketli statülerde N gün güncelleme yoksa (env `CARGO_STALE_MOVEMENT_DAYS`, vars. 14) tek seferlik ERROR "kayıp şüphesi" alarmı → ops tazmin süreci başlatır |
| B16 | Alıcı şubeden almak ister | 🟡 | Hep adrese teslim — bilinçli sadelik, değişiklik yok |

## C) Takas (iki insan + depo)

| # | Senaryo | Durum | Sistem cevabı |
|---|---------|-------|---------------|
| C17 | A gönderdi, B göndermedi | ✅ | Deadline + stuck uyarısı + force-cancel (gelen ürün sahibine RET-STK ile döner) |
| C18 | İkisi de göndermedi | ✅ | Deadline'da otomatik iptal |
| C19 | Tarafın adresi yok | ✅ | `TRADE_ADDRESS_REQUIRED` bildirimi; adres eklenince reconciliation kargoyu açar |
| C20 | Koli depoya varınca vazgeçme | ✅ | Poll + admin path cancel-lock; tek yol admin reject |
| C21 | Depoda ürün tarife uymuyor | ✅ | Admin reject → iki ürün sahiplerine + nakit refund |
| C22 | Koli taşımada hasar gördü | 🟡 | Süreç (reject) var; tazmin sorumluluğu **ops politikası** — Sürat hasar tutanağı |
| C23 | Taraf depodan gelen paketi almadı | 🟡 | İade akışına düşer (`return_in_progress`); sonrası admin manuel — nadir, ops |
| C24 | Şubeye gitti, kod yok | 🟡→✅ | A2 ile aynı çözüm (`cargo_code_ready` bildirimi takas inbound'u da kapsar) |

## D) İade (iadeyi taşıyan insan: alıcı)

| # | Senaryo | Durum | Sistem cevabı / karar |
|---|---------|-------|----------------------|
| D25 | İade açtı ama paketi hiç götürmüyor | 🔴→✅ | **Kod:** `return_shipment_open` + hareket yok + N gün (env `REFUND_RETURN_DROPOFF_DAYS`, vars. 7) → iade otomatik iptal, hold çözülür, Sürat kaydı silinir, alıcıya bildirim. Yalnız `surat` iadeler (manuel iade poll'lanamaz → ops) |
| D26 | Farklı/hasarlı ürün iade etti, para anında gitti | 🔴→✅ | **Kod:** kod 12'de anlık finalize kaldırıldı → satıcıya N saat (env `REFUND_RETURN_INSPECTION_HOURS`, vars. 24) kontrol penceresi; sorun varsa admin `disputed` yapar (finalize sweep'i `disputed`'ı atlar), yoksa otomatik finalize |
| D27 | İade paketi yolda kayboldu | 🔴→✅ | **Kod:** B15 süpürmesi `return_in_transit` bayatlarını da alarmlar |
| D28 | Satıcının adresi yok → iade depoya | 🟡 | Bilinçli fallback; satıcının depodan teslim alma süreci **ops** |
| D29 | Alıcı iade kodunu kaybetti | ✅ | Sipariş detayında her zaman görünür + kopyala |
| D30 | 14 gün doldu | ✅ | Sistem reddeder (yasal çerçeve) |

## E) Çevresel / operasyonel

| # | Senaryo | Durum | Sistem cevabı / karar |
|---|---------|-------|----------------------|
| E31 | Sürat saatlerce çöktü | ✅ | Non-blocking + retry + backoff; checkout/iade talebi etkilenmez |
| E32 | Şube "kod sistemde yok" diyor | 🔴→📋 | En olası neden test/canlı karışıklığı — aşağıdaki **go-live runbook** |
| E33 | Bayram — teslim uzuyor | 🟡 | `estimatedDelivery` sabit +3g; zararsız, değişiklik yok |
| E34 | Alıcının telefonu yanlış | 🟡 | Ulaşılamazsa teslim-edilemedi akışı işler; telefon yalnız normalize edilir |
| E35 | Alıcı kapıda ödeme sanıyor | 🟡 | Her şey peşin; gerekirse checkout metni — şimdilik değişiklik yok |
| E36 | Takasta karşı taraf adres/kod görmesin | ✅ | DTO'da tutarlı nulllama (denetimde doğrulandı) |

## 📋 Go-live runbook (E32 — test→canlı geçiş)

1. Geçiş öncesi: kodsuz bekleyen kayıt kalmadığını doğrula
   (`provider_tracking_id IS NULL` sipariş/takas/iade sorguları).
2. Coolify'da `SURAT_KARGO_TEST_MODE=false` yap, api'yi yeniden başlat.
3. **Test API'sinde üretilmiş tüm kodlar canlı şubede GEÇERSİZDİR.** Geçiş anında
   `label_created/pending` durumunda olup test kodu taşıyan kayıtları belirle
   (geçiş zamanından eski `provider_tracking_id` dolu ama teslim edilmemiş kayıtlar) ve
   kodlarını sıfırla (`provider_tracking_id = NULL, label_zpl = NULL`) → retry job canlı
   API'den taze kod üretir → kullanıcılar yeni kodu UI'da görür.
4. İlk canlı siparişte şubede uçtan uca test: kod okutulur mu, `KargoTakipHareketDetayi`
   canlıda doluyor mu.
5. Ops soruları (Sürat temsilcisine): şube `OzelKargoTakipNo` ile arama yapabiliyor mu
   (A3)? Desi/kg şubede ölçülüp cari hesaba mı yansıyor (A6)? Hasar tutanağı süreci (C22)?

## Ops politika notları (kod dışı, karar gerekli)

- **C22 hasar:** Sürat hasar tutanağı + platform mı taraf mı karşılar → politika yazılmalı.
- **D28 depo iadesi:** adressiz satıcının ürününü depodan alma prosedürü.
- **B15/D27 kayıp:** alarm sonrası akış — Sürat tazmin başvurusu, alıcıya iade,
  satıcıya ödeme kararı. Alarmlar log-tabanlı (`BARCODE AGE-OUT`, `CARGO STALE`,
  `CARGO NO-MOVEMENT` önekleri) — log uyarı kanalına bağlanmalı.
- **Manuel iade** (`returnProvider="manual"`): poll yok → D25/D27 süpürmeleri kapsamaz,
  admin takibi gerekir.
