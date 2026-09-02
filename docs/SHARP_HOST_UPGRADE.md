# sharp 0.35 ve Coolify host yükseltmesi

**Durum (2026-09-02):** `apps/api` `sharp@0.34.5`'e sabit. Bu sürüm
`GHSA-f88m-g3jw-g9cj` (yüksek) advisory'sini taşıyor; düzeltme `>=0.35.0`.
Açık, `security/dependency-audit-allowlist.json` içinde **2026-11-30'a kadar**
bilinçli kabul edildi. Kayıt dolunca `pnpm audit:prod` fail-closed çalışır ve
`deploy-production` durur — bu tarihten önce ya yükseltme yapılmalı ya da kayıt
gerekçesiyle birlikte yeniden değerlendirilmelidir.

## Neden yükseltilemiyor

sharp 0.35.x'in hazır libvips binary'leri **x86-64-v2** mikro-mimarisi ister.
Coolify host CPU'su v1. Yaşanan vaka: binary indi, yüklenirken "Unsupported
CPU" ile öldü, imaj yine "başarıyla" deploy oldu ve her görsel yüklemesi 400
verdi. O günden beri:

- `apps/api/Dockerfile` build sırasında `require('sharp')` ile guard koyar
  (CPU uyumsuzluğu ve pnpm'in sessizce atladığı optional-dependency indirmesi
  build'de yakalanır).
- `.github/dependabot.yml` sharp'ı major/minor bump'lardan hariç tutar.
- Advisory'nin işaret ettiği yükleyiciler (GIF, TIFF, VIPS) uygulama tarafında
  global olarak kapalı; dönüştürülen yüklemeler engelli MIME tiplerini reddeder.
  Yani açığın istismar yüzeyi zaten kapatılmış durumda; allowlist bu yüzden
  savunulabilir.

## Yükseltme planı (B seçeneği)

1. **Host'u doğrula.** Hedef makinede `grep -o 'x86-64-v2' /proc/cpuinfo` ya da
   `ld.so --help | grep x86-64-v2` ile v2 desteğini kontrol et. Alternatif:
   Coolify'ı v2 destekli yeni bir sunucuya taşı (staging ve production aynı
   host'ta; ikisi birlikte taşınır, bkz. `docs/OPERATIONS.md`).
2. **Staging'de dene.** `apps/api/package.json` → `"sharp": "^0.35.x"`,
   `pnpm install`, `dependabot.yml`'deki ignore kaydını kaldır. Dockerfile'daki
   guard yükleme hatasını build'de yakalar; imaj çıkmazsa host hâlâ uygun
   değildir.
3. **Görsel yükleme smoke testi.** Staging'de JPEG/PNG/WebP yükle; dönüştürme
   ve presigned URL akışı 200 dönmeli. Yükseltmeyle birlikte GIF/TIFF/VIPS
   yükleyici engelleri korunur (advisory kapansa da ürün kararı).
4. **Production.** Normal release akışı (development → master). Deploy sonrası
   ilk görsel yüklemesini elle doğrula.
5. **Allowlist kaydını sil.** `security/dependency-audit-allowlist.json`
   içindeki `GHSA-f88m-g3jw-g9cj` girdisini kaldır; audit yeşil kalmalı.

## Alternatif: kaynaktan derleme

Host yükseltilemiyorsa sharp, imaj build'inde `SHARP_IGNORE_GLOBAL_LIBVIPS=0`
ve sistem libvips'iyle kaynaktan derlenebilir (`apt-get install libvips-dev`

- `pnpm rebuild sharp`). Build süresi belirgin uzar; v1 CPU'da çalışan bir
  libvips üretir. Bu yol yalnız host yükseltmesi mümkün değilse tercih edilmeli.

## İlgili

- `apps/api/Dockerfile` — sharp guard ve gerekçe
- `.github/dependabot.yml` — sharp ignore
- `security/dependency-audit-allowlist.json` — süreli kabul
- `scripts/check-dependency-audit.mjs` — fail-closed kapı
