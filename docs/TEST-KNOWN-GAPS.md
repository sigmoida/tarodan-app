# Tarodan — Bilinen Eksikler / Açıklar (Test Edilmeyen Senaryolar)

> Bu senaryolar, hedeflenen davranışı **henüz uygulanmamış ya da buglı** olan özellikleri tarif eder. 
Kullanıcı kararıyla bunlar için **otomatik test yazılmadı**; manifest'te `gap:true` olarak işaretliler ve 
`scenario-coverage` kapsam hedefinin **dışında** tutulur. Kaynak: `Tarodan-Test-Konsolu.html` → `findings` (42 bulgu).


**Özet:** 42 bulgu · 33 senaryo gap olarak işaretli.


## 19 — Değerlendirme (RAT)

| Önem | Senaryo ref | Açıklama | Kanıt |
|---|---|---|---|
| Yüksek | RAT-110, RAT-111 | Puan **düzenleme/silme ucu yok** (PATCH/DELETE). "Düzenleme penceresi" gereksinimi uygulanmamış; tekrar POST unique kısıtla 400 döner. | `rating.controller.ts` |
| Orta | RAT-102 | "Faydalı" (helpful) işaretlemede **kullanıcı başına idempotency/tek-tık yok**; aynı kullanıcı sınırsız +1 → sayım şişirilebilir. | `rating.service.ts:495-513` |
| Orta | RAT-076 | Admin moderasyon API'si **spam/deleted** durumlarını set edemiyor: DB enum'ında var ama `UpdateRatingStatusDto` yalnız pending/approved/rejected. | `schema.prisma:2107-2113` vs `rating-admin.dto.ts:6-10` |
| Orta | RAT-124 | **Parite:** API satıcı→alıcı kullanıcı puanına izin veriyor ama web `canReview` isBuyer şartı + mobile `RatingModal` yalnız alıcı→satıcı yönünü sunuyor. | `rating.service.ts:116` |
| Orta | RAT-123 | **Yorum karakter limiti uyumsuz:** mobile üyelik-bazlı (Premium 2000) istemci kesimi yapar ama API `review @MaxLength(1000)` sabit → Premium 1000+ yazarsa API 400. | `authStore.ts:125-176` |
| Orta | RAT-063 | Küfür/uygunsuz içerik filtresi **yalnız `AI_MODERATION_ENABLED=true`** iken çalışıyor (fail-open); varsayılan kapalıda içerik DB'ye yazılır, yalnız admin yakalar. | `moderation-ai.client.ts:148` |
| Düşük | RAT-053 | `score @IsNumber()` ondalığı reddetmiyor ama DB `score Int` → 4.5 gibi değerin kayıt davranışı doğrulanmalı. | DTO + schema |
| Düşük | RAT-150, RAT-152 | Backend rating hata mesajları **sabit Türkçe**; i18n yok, `Accept-Language` etkisiz. Mobile etiketleri de hardcoded TR. | — |

## 20 — Moderasyon / Destek / Şikayet (MOD)

| Önem | Senaryo ref | Açıklama | Kanıt |
|---|---|---|---|
| Yüksek | — | İlan/profil **küfür filtresi AI servisine bağımlı**: `assertTextClean` `AI_MODERATION_ENABLED=false` iken no-op. AI kapalıyken ilan/profil küfür koruması yok (yalnız mesaj filtresi deterministik). | `moderation-ai.client.ts:148` |
| Orta | — | **Tekrarlı şikayet engeli sadece** aynı reporter + PENDING için. Farklı kullanıcıların aynı hedefi şikayeti için otomatik eşik/eskalasyon **yok**. | `user-report.service.ts:30-41` |
| Orta | — | `reports` tablosunda `(reporterId,targetId,type)` **unique kısıt yok**; eşzamanlı çift gönderimde çift PENDING yarış riski (findFirst+create arası). | — |
| Düşük | — | Misafir iletişim formu DB değil **Redis-only** (30 gün TTL); admin'e e-posta bildirimi **TODO**. | `support.service.ts:106` |
| Düşük | — | **Test/kod uyumsuzluğu:** bulk approve/reject gövdesi `ids` bekler (NOT `productIds`); mevcut e2e `productIds` gönderir, 400 toleranslı. | `admin-moderation.e2e-spec.ts:123-129` |

## 21 — Medya & Depolama (MED)

| Önem | Senaryo ref | Açıklama | Kanıt |
|---|---|---|---|
| Yüksek | MED-090 | **e2e testi var olmayan uçlara vuruyor:** `DELETE /api/media/test-key`, `GET /api/media/presigned/upload/...`. Gerçek uçlar `DELETE /media/file/*`, presigned GET yok. IDOR silmeyi (403) ve public-url private engelini (400) **hiç kapsamıyor**. | `media.e2e-spec.ts` |
| Yüksek | MED-085 | **MIME doğrulaması yalnızca client'ın bildirdiği `file.mimetype`** üzerinden; magic-byte/içerik analizi yok → PDF içeriği `image/jpeg` etiketiyle ham `/media/upload`'a geçebilir. | `media.service.ts:74`, `storage.service.ts:171` |
| Orta | MED-089 | `MulterModule`'da `limits.fileSize` ayarlı değil; 10MB kontrolü dosya tamamen **RAM'e buffer'landıktan sonra** çalışıyor → büyük dosyada bellek/DoS riski. | — |
| Orta | MED-033 | `upload/multiple` ucunda **NSFW denetimi (`assertImageClean`) YOK** (diğer upload uçlarında var) → bypass yüzeyi. | — |
| Orta | MED-075 | `upload/product` varyantları `skipMediaFile:true` → MediaFile kaydı yok → `DELETE /media/file/*` ile silinemez (orphan S3 obje riski). | — |
| Düşük | MED-086 | `uploadProductImageVariants` try/catch'siz; bozuk/sahte görselde sharp hatası 500 sızabilir. | — |
| Düşük | MED-114, MED-115 | **Parite:** mobile `mediaApi`'de `getPublicUrl` yok (yalnız web). Hata mesajı dili karışık (genel upload EN, product+storage TR). | — |

## 22 — Admin & Raporlama (ADM)

| Önem | Senaryo ref | Açıklama | Kanıt |
|---|---|---|---|
| Orta | ADM-011/012 | `AdminSession` runtime doğrulaması (expiry/oturum-iptali) bu denetimde okunmadı; gerçek akış ayrıca doğrulanmalı. | — |
| Orta | ADM-117 | Eşzamanlı escrow release idempotency garantisi `paymentService.releasePayment` içinde olmalı; payment servisi bu denetimde okunmadı (mevcut ödeme denetimi bulgularıyla tutarlı varsayım). | — |
| Bilgi | ADM-062/073 | `commission_rate` ayar anahtar adı seed varsayımı; gerçek anahtar `GET /admin/settings` ile teyit edilmeli. Admin UI (40 sayfa) tek tek okunmadı, adımlar API kontratına göre yazıldı. | — |

## 23 — Platform: i18n / Health / Cache / GraphQL (OPS)

| Önem | Senaryo ref | Açıklama | Kanıt |
|---|---|---|---|
| Yüksek | OPS-040 | **`/graphql` ucu MONTE DEĞİL** — `GraphQLAppModule` `app.module.ts:177`'de yorum satırında. (README'deki GraphQL adresi şu an pasif.) | `app.module.ts:177` |
| Yüksek | OPS-042 | GraphQL resolver'larında **yetki guard'ı yok**: `order.resolver.ts:18` sahiplik kontrolünü yorumda söyler, uygulamaz → **IDOR riski** (modül etkinleşirse kritik). | `order.resolver.ts:18` |
| Orta | OPS-018 | **Web i18n eksik anahtar:** `product.deactivateDesc` `en.json:326`'da var, `tr.json`'da **yok**, fallback de yok → TR'de ham anahtar görünür. | `en.json:326` |
| Orta | OPS-024 | **Readiness** ucu düz `Error` fırlatıyor → gerçek davranış **500**; controller `@ApiResponse` 503 belgeliyor ama 503 üretilmiyor. | — |
| Orta | OPS-037 | `cache.service.ts:342` `invalidateUserCache` geniş pattern (`*:userId*`) + `KEYS` kullanımı → prod O(N) bloklama + ilgisiz namespace silme riski. | `cache.service.ts:342` |
| Düşük | OPS-051 | `SentryInterceptor` `APP_INTERCEPTOR` global kayıtlı **değil** (yalnız export) → otomatik tüm istekleri sarmalamaz. | — |
| Düşük | OPS-020 | API i18n `{{param}}` (çift) vs istemci `{param}` (tek) format farkı; paylaşılan parametre adlandırmada uyumsuzluk riski. | `LanguageContext.tsx:42` |
| Bilgi | — | i18n/cache/graphql/sentry/monitoring için özel e2e yok; yalnız yüzeysel `health.e2e` + `smoke.e2e` var (kapsam boşluğu). | — |

## 24 — Uçtan Uca Journeyler (JRN)

| Önem | Senaryo ref | Açıklama | Kanıt |
|---|---|---|---|
| Orta | JRN-030/031/032 | Çok-satıcılı tek-checkout (iki satıcı + bağımsız escrow) için birebir e2e referansı zayıf; çalıştırılarak doğrulanmalı. | `order.controller.ts:159-188` |
| Orta | JRN-R3 | Siparişi `disputed` statüsüne sokan kullanıcı-yolu açıkça doğrulanmadı (admin resolve uçları mevcut). | `admin.controller.ts:513/543/1235` |
| Bilgi | JRN-R4 | Tüm zaman-bazlı senaryolar (escrow release, 48h, timeout, downgrade) gerçek zamanda beklenemez → **dev-hook backdate + scheduler tetik** gerektirir. | — |

## 25 — Frontend Parite (PAR)  ⚠️ mobil↔web kök-neden teyidi

| Önem | Senaryo ref | Açıklama | Kanıt |
|---|---|---|---|
| Yüksek | — | **İlan limitleri farklı:** FREE web `5/10` vs mobile `10`; Basic web `15/50` vs mobile `25`. Aynı kullanıcı iki istemcide farklı "kalan ilan" görür. | `profile/page.tsx:79-82` vs `authStore.ts:117-186` |
| Yüksek | — | **Takas escrow statüleri** (`at_warehouse`, `shipping_to_warehouse`, `awaiting_payment`...) web'de TR map'li, mobile'da map'siz → mobile TR'de çiğ İngilizce. | `web/format.ts:174-180` vs `mobile/format.ts:150-165` |
| Orta | — | Yorum karakter limiti: web sabit `500/1000`, mobile üyelik-bazlı `500-5000`. | `orders/page.tsx:887,998` vs `RatingModal.tsx:43` |
| Orta | — | **Para simgesi tutarsız:** web ProductCard `₺`, web format.ts/Navbar `TL`, mobile `TL` (web kendi içinde de tutarsız). | `ProductCard.tsx:105` vs `web/format.ts:15` |
| Orta | — | **Başlangıç dili sapması:** web `navigator.language` EN → EN başlar; mobile cihaz dilini yok sayar, daima TR başlar. | `LanguageContext.tsx:62-67` vs `mobile/i18n/index.tsx:9-11` |
| Orta | — | i18n eksik anahtar: `product.deactivateDesc` web tr.json'da yok; mobile tr.json'da `product.deactivateDesc`+`collection.createNewCollection` yok → TR'de çiğ anahtar. | en.json ⊃ tr.json ⊅ |
| Düşük | — | `product.status='deleted'` web "Kaldırıldı", mobile çiğ "Deleted". Teklif `countered` mobile map'li, web değil. | `web/format.ts:109` vs `mobile/format.ts:104-111,187` |
| Yapısal | — | **Admin i18n YOK (TR-only)**; web/mobile TR/EN. **401 davranışı üç istemcide farklı** (web cookie+path-korumalı, mobile Bearer+refresh→login, admin cookie-refresh-kuyruğu). | `admin/api.ts:50-90` |

---

## Gap olarak işaretli senaryo kimlikleri

- **ADM-011** — AdminSession süre dolumu sonrası erişim engellenir (sınır değer/güvenlik)  _(bulgu: ADM-011/012)_
- **ADM-012** — Pasif (isActive=false) admin hesabı erişemez (yetki/güvenlik)  _(bulgu: ADM-011/012)_
- **ADM-062** — Super Admin komisyon oranını günceller (para, happy path)  _(bulgu: ADM-062/073)_
- **ADM-073** — Komisyon ayarı değişiminin yeni siparişlere yansıması (para, regresyon)  _(bulgu: ADM-062/073)_
- **ADM-117** — Eşzamanlı çift escrow release güvenli (eşzamanlılık)  _(bulgu: ADM-117)_
- **JRN-030** — İki farklı satıcıdan ürünle tek checkout grubu, ürün başına sipariş  _(bulgu: JRN-030/031/032)_
- **JRN-031** — Çok-satıcılı checkout idempotency (aynı key tekrar)  _(bulgu: JRN-030/031/032)_
- **JRN-032** — Çok-satıcılı checkout: tek ödeme, bağımsız sipariş yaşam döngüleri  _(bulgu: JRN-030/031/032)_
- **MED-033** — Çoklu yüklemede NSFW denetimi YOK (kapsam farkı)  _(bulgu: MED-033)_
- **MED-075** — Ürün varyantı (skipMediaFile) DELETE ile silinemez (404)  _(bulgu: MED-075)_
- **MED-085** — MIME spoofing: PDF'i image/jpeg olarak gönder  _(bulgu: MED-085)_
- **MED-086** — MIME spoofing + sharp resize ile bozuk dosya (500/400 davranışı)  _(bulgu: MED-086)_
- **MED-089** — Çok büyük dosya — framework seviyesi sınır yokluğu  _(bulgu: MED-089)_
- **MED-090** — e2e testi gerçek controller uçlarıyla uyumsuz (regresyon riski)  _(bulgu: MED-090)_
- **MED-114** — Public URL client paritesi (`getPublicUrl`)  _(bulgu: MED-114, MED-115)_
- **MED-115** — i18n: TR vs EN hata mesajları  _(bulgu: MED-114, MED-115)_
- **OPS-018** — Web parite açığı: product.deactivateDesc TR'de yok  _(bulgu: OPS-018)_
- **OPS-020** — Web parametre enjeksiyonu {param}  _(bulgu: OPS-020)_
- **OPS-024** — Readiness — PostgreSQL düştüğünde 500/hata  _(bulgu: OPS-024)_
- **OPS-037** — delPattern geniş pattern riski (KEYS kullanımı)  _(bulgu: OPS-037)_
- **OPS-040** — GraphQL ucu şu an devre dışı (mevcut durum kanıtı)  _(bulgu: OPS-040)_
- **OPS-042** — (Modül etkinse) GraphQL resolver'larda yetki guard'ı YOK (IDOR riski)  _(bulgu: OPS-042)_
- **OPS-051** — SentryInterceptor global DEĞİL — kapsam farkı  _(bulgu: OPS-051)_
- **RAT-053** — Ondalık/string skor reddi  _(bulgu: RAT-053)_
- **RAT-063** — Filtre kapalıyken küfür geçer (fail-open doğrulaması)  _(bulgu: RAT-063)_
- **RAT-076** — Admin DTO `spam`/`deleted` kabul etmiyor (kapsam farkı)  _(bulgu: RAT-076)_
- **RAT-102** — Faydalı işaretleme idempotency koruması YOK (bilinen risk)  _(bulgu: RAT-102)_
- **RAT-110** — Puan düzenleme ucu yok (yeniden gönderim unique ile reddedilir)  _(bulgu: RAT-110, RAT-111)_
- **RAT-111** — Kullanıcı kendi puanını silemez  _(bulgu: RAT-110, RAT-111)_
- **RAT-123** — Mobile karakter limiti üyelik bazlı (istemci), API sabit  _(bulgu: RAT-123)_
- **RAT-124** — Satıcı→alıcı puanı UI'da yok (API'de var) — parite boşluğu  _(bulgu: RAT-124)_
- **RAT-150** — Backend hata mesajları Türkçe (sabit)  _(bulgu: RAT-150, RAT-152)_
- **RAT-152** — Mobile RatingModal etiketleri (TR sabit)  _(bulgu: RAT-150, RAT-152)_
