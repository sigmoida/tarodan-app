# Vitrin Hero'su ve Güven Rozetleri (Hero CMS)

Ana sayfa slider'ı, giriş/kayıt ekranlarının görsel paneli ve ana sayfadaki güven rozetleri
admin'den yönetilir; web ve mobil aynı uçları okur. **Kodda yedek slayt yoktur** — tek kaynak
veritabanıdır. Sözleşme: `packages/types/src/hero.ts` + `localized-text.ts`. Mobil sözleşme:
`docs/mobile-parity/24-api-delta-hero-trust.md`.

## Model

| Tablo          | Ne taşır                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero_slides`  | `placement` (`home` · `auth_default` · `auth_register`), `isActive`, `displayOrder`, `startDate?`/`endDate?`, `imageUrl`, `mobileImageUrl?`, `imageSide` (`left`/`right`), metinler, 2 buton, `hideOnIos`, sayaçlar |
| `trust_badges` | `icon` (`TRUST_BADGE_ICONS`), `title`, `description?`, `hideOnIos`, `isActive`, `displayOrder`                                                                                                                      |

- **Metinler `LocalizedText` JSON'udur**: `{ tr, en? }`. Türkçe zorunlu; İngilizce boşsa
  istemci Türkçeye düşer (`pickLocalized`). Kural tek yerde: `validateLocalizedText` (admin
  formu + API). Sınırlar `HERO_TEXT_LIMITS` (başlık 120, alt başlık 240, buton 40, görsel metni 160) ve `TRUST_BADGE_LIMITS` (başlık 60, açıklama 160).
- **Buton** = etiket + bağlantı çifti; ikisi birlikte var ya da yok (`server.hero.ctaIncomplete`).
  Bağlantı reklamla aynı kural: mutlak `http(s)` ya da tek `/` ile başlayan site içi yol.
- `auth_register` kayıt ekranlarında, `auth_default` diğer auth ekranlarında kullanılır.
- `hideOnIos` = **"native uygulamada gizle"**: mobil uygulama bayraklı slaytı (ve güven rozetini)
  iOS'ta da Android'de de göstermez; web yok sayar. Dijital satış native'de artık iki mağazada da
  kapalı olduğundan bayrak platformdan bağımsızdır. API alan adı `hideOnIos` KALDI (mobil
  sözleşmesi: 1.0.5/1.0.6 bu adı okur); yalnız anlam ve admin metni genişledi. Süzmeyi istemci yapar,
  sunucu liste döndürürken bayraklıları çıkarmaz (web de aynı listeyi okur). Ana sayfa "boş kalmasın"
  koruması bayraklı slaytları saymaz (aşağıda).

## Yayın kuralı

Yayında = `isActive` + tarih penceresinin içinde (sınırlar dahil; reklamla ortak
`withinScheduleWindow`). Tek tanım `isHeroSlideLive` — vitrin okuması, sayaçlar, admin
`isLive` ve guard'lar bunu kullanır.

- **En çok 5 yayında slayt** (`HERO_MAX_SLIDES`, yerleşim başına): pencereler şimdiden itibaren
  kesiştirilir — aynı anda 5'ten fazlası açık olacaksa oluşturma/açma `409
server.hero.maxLiveSlides`. Başka bir slaytın bitişinden sonraya zamanlanan slayt kabul edilir.
- **Ana sayfa slider'ı hiçbir an boş kalamaz** (`409 server.hero.lastLiveHomeSlide`): silmek,
  kapatmak, penceresini kısaltmak/dışarı almak, başka yerleşime taşımak ya da native'de gizlemek,
  slider'ın ŞİMDİDEN itibaren kesintisiz dolu kalacağı anı erkene çekemez. Hesap iki şeyi sayar:
  - **Bitiş tarihi**: diğer slaytlar yarın bitiyorsa kalıcı slaytı silmek (ya da tek slayta bitiş
    vermek) slider'ı yarın boş bırakır → reddedilir. Başka bir slayt bitişi tam devralıyorsa
    (biri bittiği an öbürü başlar; sınırlar dahil) kabul edilir. Admin formu bitişi gün sonu
    (`23:59:59.999`), başlangıcı gün başı (`00:00:00.000`) gönderdiği için ardışık günlük devirdeki
    1 ms'lik fark kesinti SAYILMAZ; en çok 1 dakikalık boşluk tolere edilir, daha uzunu kesintidir.
  - **`hideOnIos`** (native uygulamada gizle): yalnız gizlenmeyen slaytlar mobil listeyi doldurur.
    Web bayrağı yok sayar, yani native'i dolduran liste web'i de doldurur; koruma native görünümü esas alır.
    Kıyas "önce / sonra"dır, mutlak değil: zaten kesintili bir slider'ın metnini düzeltmek engellenmez,
    yalnız durumu kötüleştiren değişiklik reddedilir. Auth yerleşimleri boş kalabilir (web paneli
    gizler). Not: tarihi kendiliğinden biten son slaytı koruma engelleyemez (yalnız YENİ değişikliği
    denetler) — admin listesinde `isLive` uyarısı ve lansman doğrulaması (`verify:prod:launch`) bunu yakalar.

## Uçlar

Public (`@Public`, `Cache-Control: public, max-age=60`):

| Uç                                     | Açıklama                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /hero-slides?placement=`          | `HeroSlideDto[]` — yayındakiler, `displayOrder` sırasıyla, en çok 5; iki dil birden      |
| `GET /trust-badges`                    | `TrustBadgeDto[]` — açık rozetler; `{returnWindowDays}` gibi süre belirteçleri dolu      |
| `POST /hero-slides/:id/impression`     | 204, beacon dostu                                                                        |
| `POST /hero-slides/:id/click?cta=1\|2` | 204; `cta` yoksa görsele tık, varsa butona (slayt toplamı + buton sayacı birlikte artar) |

Admin (`super_admin`/`admin`/`moderator`; izin matrisinde `hero-slides` ve `trust-badges` → `ads`):

| Uç                                                                           | Açıklama                                                             |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /admin/hero-slides?placement=` · `GET /admin/hero-slides/:id`           | `AdminHeroSlideDto` — pasif/zamanlanmış dahil, sayaçlarıyla          |
| `POST` · `PATCH /:id` · `DELETE /:id` (204)                                  | PATCH'te alan yok = dokunma, `null` = temizle                        |
| `PATCH /admin/hero-slides/reorder { ids }`                                   | Tek yerleşim; dizi sırası = `displayOrder`                           |
| `POST /admin/hero-slides/upload` (multipart `file`)                          | jpeg/png/webp, 5 MB, `products/hero/`, en çok 2400 px en → `{ url }` |
| `/admin/trust-badges` (GET, GET `:id`, POST, PATCH, DELETE, `PATCH reorder`) | Aynı desen, yükleme yok; metin ham (belirteçli) döner                |

Her yazım admin denetim kaydına (`hero_slide_*`, `trust_badge_*`, önce/sonra) yazılır.

## Sayaçlar

`impressionCount`, `clickCount` (tüm tıklar), `cta1ClickCount`, `cta2ClickCount`. Yalnız
**yayındaki** slayta yazılır; IP + slayt (+ buton) başına tekilleşir (gösterim 30 dk, tık 10 sn)
ve istemci IP'si başına 60/dk kısılır — reklamla aynı tanım (`common/helpers/beacon-tracking`).
Sayılmayan istek (bilinmeyen id, yayında olmayan slayt, olmayan buton, geçersiz `cta`) de 204'tür.

## Güven rozeti süre belirteçleri

Rozet metni herkese açık bir süreyi `{kayıtKimliği}` belirteciyle anar (ör. `{returnWindowDays}
gün koşulsuz iade`). Public uç belirteci Süreler ve Kurallar'ın güncel değeriyle doldurur; yalnız
`PUBLIC_TIMING_RULE_IDS` dolar, tanınmayan belirteç olduğu gibi kalır. Süreler okunamazsa kayıt
varsayılanı kullanılır.

## Önbellek tazeleme

Her yazımdan sonra `notifyWebRevalidate`: ana sayfa slaytı → `home:hero`, auth slaytları →
`auth:hero`, rozetler → `home:trust`. Yerleşim değişirse iki etiket birden.

## Seed

`prisma/seed-hero-content.ts` (referans katmanı; `seed-production.ts` her açılışta, yerel demo
seed'i de çağırır): eski web sabitlerinden ana sayfa slaytı, iki auth görseli ve altı rozet.
Sabit kimlik + `update: {}`; yerleşim (rozetlerde tablo) **boşken** yazar — admin düzenlemesi
ezilmez, silinen seed slaytı geri gelmez.
