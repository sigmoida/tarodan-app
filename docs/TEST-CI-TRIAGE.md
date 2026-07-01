# Tarodan — Senaryo E2E Paketi: CI Triyaj & Bilinen Risk Notları

Bu paket (2293 senaryodan üretilen e2e testleri) **hiçbir yerde çalıştırılamadan** (üretim ortamında Node/Docker yoktu) gerçek koda karşı **statik doğrulama** ile yazıldı. Gerçek yeşil/kırmızı **ilk CI koşusunda** belli olur. Bu dosya, o ilk koşuda muhtemel kırmızıları ve nasıl triyaj edileceğini özetler.

## Nasıl çalıştırılır
- Feature branch → PR aç: `e2e-scenarios-smoke` (P0) + `scenario-coverage` otomatik koşar.
- Tam 2293: GitHub → Actions → CI → Run workflow → `run_scenarios_full=true` (10 shard) — veya her gece 02:00 UTC.
- Servisler (postgres/redis/elasticsearch/mailhog) CI'da otomatik ayağa kalkar.

## Kırmızı çıkarsa nasıl okunur
Her test adı senaryo ID'siyle başlar: `PAY-042 [P0] <başlık>`. Hata mesajı beklenen↔alınan farkını verir (ör. `expected 201, got 200`). İlgili dosya: `apps/api/test/e2e/scenarios/<NN>-<prefix>.e2e-spec.ts` içinde `scenario('PAY-042', ...)`. Düzeltme testte yapılır (uygulama manuel çalışıyor → hatalar assertion uyumsuzluğudur, ürün bugı değil).

## Kategori bazlı bilinen riskler (ilk koşuda dikkat)
- **MailHog bağımlı** (AUTH-036/041/044/112 vb.): doğrulama/şifre e-postası okuma. MailHog servisi CI'da var; yine de timing/format kaynaklı flaky olabilir. Yedek: DB tarafı (`email_verification_tokens`/`password_reset_tokens`) de assert ediliyor.
- **Elasticsearch indeksleme** (SRC/06): ürün oluşturunca ES'e yansıma asenkron; arama testleri indexleme gecikmesine takılabilir. Gerekirse test içi `dev reindex` + kısa poll.
- **Eşzamanlılık/yarış** (STK/15, AUTH-065, MEM-150/152, PAY çift-callback): `Promise.all` ile yarış testleri; bazıları kasıtlı toleranslı (`>=1 başarılı`) yazıldı, deterministik değil.
- **Cron/scheduler** (ORD-044.. auto-complete, COM release-holds-due/payout, OFR expire-offers, TRD cancel-expired-trades, MEM auto-renew): `/api/dev/run/*` hook'u veya servis metodu ile tetikleniyor; feature-flag'e (`.env.test`) bağlı olanlar flag durumuna duyarlı.
- **Para/PayTR mock** (PAY/COM/REF/TAX): `MockPayTRService` + `signCallback` ile; `providerConversationId`/tutar (kuruş) eşleşmesi kritik.
- **Fazla-skip artıkları**: bazı domainlerde (özellikle 23-ops, 18-msg, 14-shp) review turu yarım kaldıysa gereğinden fazla `scenario.skip` kalmış olabilir; bunlar kırmızı değil ama kapsamı düşürür — review ile aktive edilmeli.

## Domain bazlı düşük-güven noktaları (review ajanlarının notları)
- **AUTH**: `refresh` düz `{accessToken,refreshToken}` döner (düzeltildi); 429/throttle testleri `.env.test`'te throttle kapalı olduğu için skip; Google-auth pozitif akışları mock edilemediği için skip; AUTH-065 refresh yarışı TOCTOU → toleranslı.
- **USR**: IBAN DTO boşluk kabul etmez (boşluksuz gönderiliyor); banned guard 403 `USER_BANNED`.
- **ORD**: RefundRequest alanları `requesterId` + `refundNumber` (düzeltildi); auto-complete cron feature-flag OFF varsayımıyla.
- **PAY**: `process-direct`/`callback` gövde şekli; PaymentHold `held→released`; 16 skip (bir kısmı aktive edilebilir).
- **MEM**: 0 düzeltme (temiz); rol-gating boşluğu (moderator servise ulaşır) → testler iş-mantığı sonucunu bekliyor.
- **COL**: 0 düzeltme (temiz); gizli koleksiyon 403, cascade silme sayımları.
- **Henüz review'siz/kısmi** (öncelik triyaj): 23-ops, 18-msg, 21-med, 06-src, 14-shp — author-only; assertion + skip denetimi CI öncesi/ sonrası yapılmalı.

## Kapsam
Güncel: `docs/SCENARIO-COVERAGE.md` (~%90 aktif, 33 gap [bkz. `docs/TEST-KNOWN-GAPS.md`], geri kalan skip = UI/uygulanamaz). Hedef: review turları bitince gap+gerçek-UI hariç ~%100.
