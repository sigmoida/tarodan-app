# 16 — Agent Brifingi: Ne Yapıldı, Nereden Başlanacak

> **Bu dosya, mobil pariteyi kapatacak agent'ın ilk okuyacağı dosyadır.**
> Amaç: `github.com/sigmoida/tarodan-mobile` uygulamasının işlevini en kısa
> zamanda web (`apps/web`) ile eşitlemek. Bu dosya "ne yapılacağı"nı tekrar
> anlatmaz; **hangi dosyada ne bulacağını ve hangi sırayla bakacağını** anlatır.

---

## 1. Ne yaptık (2026-08-02 durum tespiti)

Backend (`tarodan-app`, branch `development`) mobil dokümanlarının son
hazırlandığı committen sonra hızla değişti. 2026-08-02'de şunları yaptık:

1. **Doküman commitleri saptandı:** `docs/mobile-parity/` en son `59016d23`
   (2026-07-31), `docs/mobile-api-reference.html` en son `d4ba1f65` (2026-07-30)
   commitlerinde hazırlanmıştı. Aradan 86 commit geçmişti.
2. **`docs/mobile-api-reference.html` yeniden üretildi** (`pnpm docs:mobile-api`,
   301 endpoint). Bu dosya elle yazılmaz; `apps/api` kaynağından üretilir.
3. **`15-api-delta-2026-08-02.md` yazıldı:** 86 commit'lik diff kod üzerinden
   doğrulanıp mobil istemciyi ilgilendiren her sözleşme/davranış değişikliği
   (hizmet KDV'si, GRP/PKG/ORD kodları, medya sözleşmesi, `tradeAvailable`,
   referans önekleri…) tek delta dosyasında toplandı.
4. **Mobil `main` (`e0230f5`, 2026-08-01) klonlanıp üç ayrı denetimle tarandı:**
   eski matristeki P0/P1 iddiaları, P2 + uç yolu çelişkileri ve 15'teki her
   delta maddesinin mobilde uyarlanma durumu — hepsi dosya:satır kanıtıyla.
5. **`13-parity-matrix.md` v2 olarak yeniden yazıldı:** Eski 21 bulgunun neredeyse
   tamamı mobilde kapanmış çıktı; buna karşılık yeni API delta'sı **4 yeni
   canlı-kırıcı çatışma** yaratmış durumda. Matris artık güncel gerçeği anlatıyor.

**Sonuç tablosu:** mobil işlevsel olarak web'e çok yakın; işi bitirmek demek
büyük ölçüde **13'teki P0-P1-P2 listesini yukarıdan aşağı kapatmak** demek.

---

## 2. Kaynaklar — neye güveneceksin

| Kaynak                                       | Rolü                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `github.com/sigmoida/tarodan-mobile` `main`  | **Kanonik mobil kod.** Lokal `/Users/kaan/Projects/tarodan-mobile` klonu bayat ve yanlış remote'da — KULLANMA; GitHub'dan taze çek |
| `tarodan-app` `development` → `apps/api/src` | **Sözleşmenin tek gerçeği.** Doküman ile kod çelişirse kod kazanır                                                                 |
| `docs/mobile-api-reference.html`             | Üretilmiş endpoint kataloğu + durum sözlükleri. Bayatlamışsa `pnpm docs:mobile-api` ile yeniden üret                               |
| `docs/mobile-parity/*.md`                    | Sözleşme + kabul kriterleri (aşağıdaki okuma sırasıyla)                                                                            |
| ~~Swagger/OpenAPI~~                          | **Güvenme** — örn. `CheckoutQuoteResponseDto` `pricing.summary`'yi bilmiyor; kaynak kod esas                                       |

Doküman öncelik zinciri (çelişkide sağdaki soldakini ezer):
**01–12 → 14 → 15 → 13(v2)** — ve hepsini `apps/api` kodu ezer.

---

## 3. Okuma sırası

1. **`00-README.md`** — ortak kurallar: base URL, bearer auth, throttle, yanıt
   normalizasyonu, hata biçimi.
2. **`11-api-contract.md` + `12-mobile-platform.md`** — istemci sözleşmesi,
   sayfalama, token saklama, deep link, force-update.
3. **`15-api-delta-2026-08-02.md`** — son API değişiklikleri. Başındaki
   **"Mobil uyarlama durumu"** tablosu hangi maddenin zaten uyumlu (✅), hangisinin
   çatışma (🔴) olduğunu söylüyor — ✅ olanlar için iş üretme.
4. **`13-parity-matrix.md` (v2)** — **iş listen budur.** Her satırda mobil
   dosya:satır kanıtı ve "Yapılacak" hücresi var. "Uygulama sırası önerisi"
   bölümündeki sırayı izle.
5. İlgili domain dosyası (01–10) — yalnız üzerinde çalıştığın maddenin alanı için;
   kabul kriterleri orada. Kargo/paket işi yapıyorsan **14** okumadan başlama.

---

## 4. İlk dört iş (P0) ve bakılacak dosyalar

Matristeki sırayla; her biri için sol sütun mobil repo, sağ sütun API doğrulama
noktası:

| İş                                                                                                                                                                              | Mobilde dokunulacak yer                                                                                                                                        | API'de doğrulama                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **1+3. Checkout:** `expectedPricingHash` + `expectedShippingTariffVersion` gönder ve toplamı `pricing.summary`'den bas (yerel aritmetiği + `GET /shipping/rates` çağrısını sil) | `app/checkout/_hooks/useCheckout.ts`, `app/cart/_hooks/useCart.ts`, `src/lib/api/orders.ts` (4 payload üreticisi), `app/checkout/_components/OrderSummary.tsx` | `apps/api/src/modules/order/dto/checkout.dto.ts`, `order-pricing.service.ts` (`summary` üretimi), 409 davranışı           |
| **2. Kayıt:** `username` alanı + regex + uygunluk kontrolü                                                                                                                      | `app/(auth)/register/_lib/schema.ts`, `_components/RegisterForm.tsx`, `src/lib/api/auth.ts`                                                                    | `apps/api/src/modules/auth/dto/register.dto.ts` (`^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$`), `GET /auth/username-availability` |
| **4. Mesaj görselleri:** bearer'lı görsel yükleme (`expo-image` `headers` veya token'lı fetch→cache)                                                                            | `app/messages/[threadId]/_hooks/useMessageThread.ts`, `src/utils/contentFilter.ts`, `src/utils/imageUrl.ts`                                                    | `apps/api/src/modules/media/media.controller.ts` (`message-attachment/:id`, JWT + 302)                                    |

P0'lar bitince matristeki P1 #5 (sipariş para dökümü) ve #6 (paket boyutu — 14'ün
tamamı) gelir; gerisi matristeki sıra.

---

## 5. Çalışma kuralları

- **Salt mobil repoda kod yaz**; `tarodan-app` tarafında kod değişikliği bu işin
  kapsamı dışında (API'de hata bulursan not düş, değiştirme).
- Mobil reponun kendi düzenini kullan: `app/` expo-router, API katmanı
  `src/lib/api/*`, tasarım kuralları `tarodan-mobile/CLAUDE.md`. Yeni desen icat etme.
- Her maddede önce **kanıt satırını aç ve hâlâ geçerli mi bak** — matris
  `e0230f5`'e göre yazıldı; `main` ilerlediyse bulgu kapanmış olabilir.
- Domain dosyasındaki **kabul kriterleri** işaretlenmeden "bitti" deme; mevcut
  Jest/Maestro düzenine test ekle (örnekler: `login-2fa.test.tsx`,
  `noDeadShowcase.test.ts` gibi regresyon kalıpları).
- Parayla ilgili hiçbir değeri istemcide hesaplama/yuvarlama — sunucudan geleni
  bas. Bu, 13'teki P0 #3'ün kök sebebiydi.
- Bir bulguyu kapattığında `13-parity-matrix.md` satırını güncelle (✅ + kısa not);
  matris yaşayan doküman.

---

## 6. Bilinçli kararlar — "eksik" sanıp iş üretme

- **Misafir sepeti cihaz-yerel** ("Faz A") — sunucu sepeti yalnız üyede ayna.
- **Sepette kupon ucu bağlanmadı** — kupon bilinçli olarak checkout'ta uygulanıyor.
- **iOS `associatedDomains` kaldırıldı** — AASA yayını bekliyor (mobil repoda
  Faz 4.1); Android intent filter'ları ve `tarodan://` çalışıyor.
- **Erken erişim kodu (`/site-access/verify`) mobili bağlamıyor** — yalnız web
  middleware kilidi.
- **Desi mobilde asla görünmez** — paket boyutu kartları gösterilir (14).
