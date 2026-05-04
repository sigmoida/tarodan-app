# Mobil Manuel Test — Çalıştırma Rehberi

Bu klasör, Tarodan mobil uygulamasının uçtan uca manuel test çıktılarını barındırır. Plan: `~/.claude/plans/imdi-mobile-k-sm-n-superpower-mighty-hearth.md`.

## Dosyalar

- `ortam-snapshot.md` — Test başlangıcındaki ortam (commit hash, sim modeli, tarih). Her test koşusunda yenilenir.
- `faz1-kritik-checklist.md` — Kritik akışların adım-adım listesi (F1.1 → F1.9).
- `faz2-parity-checklist.md` — Web parity ve geri kalan ekranlar (Faz 1 bitince doldurulur).
- `bug-rapor.md` — Bulgular (B-001, B-002, ...). Her bulgu severity etiketi taşır.

## Nasıl koşulur

1. **Backend**: `curl http://localhost:3001/api/health` → 200 olmalı. Yoksa: `pnpm --filter @tarodan/api dev`.
2. **Docker**: `docker ps` → postgres/redis/elastic/mailhog healthy.
3. **Mobil**: `cd apps/mobile && pnpm ios` (iPhone 17 simulator).
4. **Test kullanıcıları** (hepsi `Demo123!`): admin@, zeynep@demo.com (FREE), mehmet@demo.com (BASIC), ahmet@demo.com (PREMIUM), ali@demo.com (BUSINESS).
5. `faz1-kritik-checklist.md`'deki sırayla ilerle. Her satırda ☐ kutucuğunu ✅ veya ❌ + bug ID ile değiştir.
6. Bug bulunca `bug-rapor.md`'a B-### olarak ekle, checklist satırına ID'yi yaz (sadece raporla, fix yapma).

## Bypass hakkında önemli not — iki modlu test

API tarafında `PAYMENT_BYPASS` flag'i tüm ödeme yollarının davranışını **kökten değiştiriyor**:

- **`PAYMENT_BYPASS=true` (mevcut)**: API sipariş ve membership için `paymentUrl` üretmez, sadece `{useBypass: true, paymentId}` döner. Mobil **sipariş checkout** ([checkout/index.tsx:425-432](../../app/checkout/index.tsx#L425-L432)) ve **membership checkout** ([membership/checkout.tsx:212-260](../../app/membership/checkout.tsx#L212-L260)) `paymentUrl`'i bulamayınca paymentId ile `/payment/[id]` ekranına route eder; o ekran ([payment/[id].tsx](../../app/payment/[id].tsx)) `useBypass`'ı **hiç handle etmiyor** → WebView boş/kırık yüklenir, ödeme tamamlanamaz. Sadece **takas nakit fark ödemesi** ([trade/[id].tsx:478](../../app/trade/[id].tsx#L478)) bu modda mobilde çalışır (orada `useBypass` doğru handle ediliyor).
- **`PAYMENT_BYPASS=false`**: API tüm ödemeler için PayTR iframe URL'i üretir (takas dahil — retry yolu fresh token üretir). Sipariş, membership ve takas nakit için sandbox kart yolu burada test edilir.

Bu nedenle **iki ayrı koşu** gerekir. Detay ve sıralama [faz1-kritik-checklist.md](faz1-kritik-checklist.md) başındaki "İki modlu test" bölümünde. Mod geçişi:

```bash
# .env'de PAYMENT_BYPASS değerini değiştir, sonra:
pkill -f "nest start"
pnpm --filter @tarodan/api dev > /tmp/tarodan-api.log 2>&1 &
# Mobil terminalinde 'r' ile reload
```

## Severity tanımları

- **blocker** — akış tamamlanamıyor (login bozuk, ödeme gerçekleşmiyor).
- **major** — akış çalışıyor ama yanlış sonuç ya da bozuk UX.
- **minor** — küçük tutarsızlık.
- **cosmetic** — yalnız görsel.

## Verification (testin tamamlanma kriteri)

- [ ] `ortam-snapshot.md` doldurulmuş.
- [ ] Faz 1'in tüm satırları ✅ veya ❌ + bug ID.
- [ ] `bug-rapor.md` her bulgu için tekrarlanabilir adım + severity içeriyor.
- [ ] Faz 2 bitiminde web parity tablosunun her satırına sonuç (✅/❌/⚠️) yazılmış.
