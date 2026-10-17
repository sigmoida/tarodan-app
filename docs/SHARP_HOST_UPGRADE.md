# sharp 0.35 ve Coolify host yükseltmesi

**Status (2026-10-17):** `apps/api` is pinned to `sharp@0.34.5` (Next.js in web
and admin resolves the same version). It carries three high advisories, each
accepted in `security/dependency-audit-allowlist.json` with an expiry:

| Advisory                        | Fixed in | Expires        | Mitigation in place                                                 |
| ------------------------------- | -------- | -------------- | ------------------------------------------------------------------- |
| `GHSA-f88m-g3jw-g9cj`           | 0.35.0   | 2026-11-30     | GIF, TIFF, VIPS loaders blocked                                     |
| `GHSA-rgj7-g3m4-5g8c`           | 0.35.4   | 2026-11-30     | same host constraint                                                |
| `GHSA-wq5f-xc86-pv6w` (librsvg) | 0.35.5   | **2026-10-31** | API blocks the SVG loader; Next.js serves sniffed SVG without sharp |

When an entry expires, `pnpm audit:prod` fails closed and the production
release stops. Before the earliest expiry, upgrade (the plan below) or
re-review the entry with its reason. The upgrade target is now **0.35.5**.

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
2. **Try it on staging.** Set `apps/api/package.json` to `"sharp": "^0.35.5"`,
   run `pnpm install` (check that Next.js resolves the same version) and remove
   the ignore entry from `dependabot.yml`. The Dockerfile guard catches a load
   failure at build time; if no image comes out, the host is still not ready.
3. **Image upload smoke test.** Upload a JPEG, PNG and WebP on staging; the
   transform and presigned URL flow must return 200. The GIF, SVG, TIFF and
   VIPS loader blocks stay after the upgrade (a product decision, even once
   the advisories close).
4. **Production.** Normal release akışı (development → master). Deploy sonrası
   ilk görsel yüklemesini elle doğrula.
5. **Remove the allowlist entries.** Delete the three sharp entries from
   `security/dependency-audit-allowlist.json`; the audit must stay green.

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
