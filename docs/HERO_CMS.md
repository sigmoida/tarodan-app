# Vitrin Hero'su ve Güven Rozetleri (Hero CMS)

Ana sayfa slider'ı, giriş/kayıt ekranlarının görsel paneli ve ana sayfadaki güven rozetleri
admin'den yönetilir; web ve mobil aynı uçları okur. **Kodda yedek slayt yoktur** — tek kaynak
veritabanıdır. Sözleşme: `packages/types/src/hero.ts` + `localized-text.ts`. Mobil sözleşme:
`docs/mobile-parity/24-api-delta-hero-trust.md`.

## Model

| Tablo          | Ne taşır                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero_slides`  | `placement` (`home` · `auth_default` · `auth_register`), `platform` (`web` · `app` · `all`), `isActive`, `displayOrder`, `startDate?`/`endDate?`, `imageUrl`, `mobileImageUrl?`, `imageSide` (`left`/`right`), metinler, 2 buton, `hideOnIos`, sayaçlar |
| `trust_badges` | `icon` (`TRUST_BADGE_ICONS`), `title`, `description?`, `hideOnIos`, `isActive`, `displayOrder`                                                                                                                                                          |

- **Metinler `LocalizedText` JSON'udur**: `{ tr, en? }`. Türkçe zorunlu; İngilizce boşsa
  istemci Türkçeye düşer (`pickLocalized`). Kural tek yerde: `validateLocalizedText` (admin
  formu + API). Sınırlar `HERO_TEXT_LIMITS` (başlık 120, alt başlık 240, buton 40, görsel metni 160) ve `TRUST_BADGE_LIMITS` (başlık 60, açıklama 160).
- **Buton** = etiket + bağlantı çifti; ikisi birlikte var ya da yok (`server.hero.ctaIncomplete`).
  Bağlantı reklamla aynı kural: mutlak `http(s)` ya da tek `/` ile başlayan site içi yol.
- **Mağaza butonu** (şema değişikliği yok): buton adresi App Store (`apps.apple.com`,
  `itunes.apple.com`) ya da Google Play (`play.google.com/store/apps/…`) sayfasıysa
  (`heroStoreLinkKind`, `@tarodan/types`) web onu koyu mağaza butonu olarak çizer (telefon simgesi,
  "Mobilde aç" + etiket, yeni sekme); mobil uygulama bu butonları **gizler**. Butonlarının hepsi
  mağaza bağlantısı olan slayt (`heroHasOnlyStoreCtas`) uygulamada **hiç gösterilmez** ve admin
  onu uygulamada yayında saymaz (görünürlük kartı ve "Yayında · uygulama gizli"). Uygulama tanıtımı da böylece tamamen admin'den yönetilen bir
  slayttır (kodda sabit tanıtım slaytı ve `NEXT_PUBLIC_APP_PROMO_ENABLED` kaldırıldı).
- `auth_register` kayıt ekranlarında, `auth_default` diğer auth ekranlarında kullanılır.
- `hideOnIos` = **"hide in the native app"**: the mobile app hides a flagged slide (and the trust
  badge) on both iOS and Android; web ignores it. Digital sales are now off in both native stores,
  so the flag is platform-independent. The API field name `hideOnIos` STAYED (mobile contract:
  1.1.0 reads this name); only its meaning and the admin copy widened. The client filters; the
  server does not drop flagged slides from the list (web reads the same list).
- **`platform`** (`ContentPlatform`, reklamla ortak enum): `web` yalnız sitede, `app` yalnız
  mobil uygulamada, `all` (varsayılan; göç öncesi slaytlar da) ikisinde. İstemci kendini
  `?platform=web|app` ile tanıtır ve kendi hedefini + `all`'ı görür.

## Yayın kuralı

Yayında = `isActive` + tarih penceresinin içinde (sınırlar dahil; reklamla ortak
`withinScheduleWindow`). Tek tanım `isHeroSlideLive` — vitrin okuması, sayaçlar ve admin
`isLive` bunu kullanır.

- **En çok 5 yayında slayt** (`HERO_MAX_SLIDES`, yerleşim ve istemci başına): `web` ile `app`
  slaytları birbirinin sınırını tüketmez, `all` ikisinde de sayılır. Pencereler şimdiden itibaren
  kesiştirilir — bir istemcide aynı anda 5'ten fazlası açık olacaksa oluşturma/açma/platform
  değiştirme `409 server.hero.maxLiveSlides`. Başka bir slaytın bitişinden sonraya zamanlanan
  slayt kabul edilir.
- **Her yerleşim boş kalabilir** — son slayt da silinir, kapatılır, taşınır. İstemci boş listede
  bölümü hiç çizmez (web `HeroSlider` → `null`, auth paneli gizlenir). Eski "son yayındaki ana
  sayfa slaytı korunur" kuralı (`server.hero.lastLiveHomeSlide`; bitiş tarihi + `hideOnIos`
  hesaplı "kesintisiz örtü" sürümü dahil) kaldırıldı: boş liste artık hata değil, istemcinin
  gizlediği meşru bir durumdur.
- **Ana sayfa anahtarı** (istemci başına, PlatformSetting `hero_home_enabled_web` /
  `hero_home_enabled_app`, `'true'`/`'false'`; satır yoksa açık): kapalıyken o istemcinin
  `placement=home` okuması `[]` döner, slaytlara dokunulmaz. Yalnız ana sayfa içindir; auth
  yerleşimleri yalnız platformla süzülür. Admin: Pazarlama → Hero, ana sayfa sekmesinde tablonun
  üstündeki "Ana sayfa görünürlüğü" kartı — istemci başına bir satır (Web sitesi / Mobil uygulama)
  ve canlı özet ("3 slayt yayında", "yayında slayt yok", "gizli: anahtar kapalı", uygulamada
  yayındakilerin hepsi `hideOnIos` ise "gizli" — bayrak iOS ve Android'de gizler). Tablodaki yayın
  durumu da anahtarı hesaba katar: yayında ama platformu kapalı slayt "Yayında · web gizli"
  (uyarı tonu) görünür. Bu anahtarlar ve seed işareti genel
  `PATCH /admin/settings/:key` ucundan yazılamaz (`server.hero.useDedicatedEndpoint`).
- Lansman doğrulaması (`verify:prod:launch`) ana sayfa hero'sunu iki istemci için ayrı okur;
  boşsa **uyarır** (`REVIEW:`), düşürmez — boş hero meşru bir karardır.

## Uçlar

Public (`@Public`, `Cache-Control: public, max-age=60`):

| Uç                                      | Açıklama                                                                                                                                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /hero-slides?placement=&platform=` | `HeroSlideDto[]` — bu istemcide yayındakiler (`platform` ∈ {istemci, `all`}), `displayOrder` sırasıyla, en çok 5; iki dil birden. `platform` = `web`\|`app`, yoksa `app` (parametresiz istemci eski mobil sürümlerdir). `placement=home` + anahtar kapalı → `[]` |
| `GET /trust-badges`                     | `TrustBadgeDto[]` — açık rozetler; `{returnWindowDays}` gibi süre belirteçleri dolu                                                                                                                                                                              |
| `POST /hero-slides/:id/impression`      | 204, beacon dostu                                                                                                                                                                                                                                                |
| `POST /hero-slides/:id/click?cta=1\|2`  | 204; `cta` yoksa görsele tık, varsa butona (slayt toplamı + buton sayacı birlikte artar)                                                                                                                                                                         |

Admin (`super_admin`/`admin`/`moderator`; izin matrisinde `hero-slides` ve `trust-badges` → `ads`):

| Uç                                                                           | Açıklama                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /admin/hero-slides?placement=` · `GET /admin/hero-slides/:id`           | `AdminHeroSlideDto` — pasif/zamanlanmış dahil, sayaçlarıyla                            |
| `POST` · `PATCH /:id` · `DELETE /:id` (204)                                  | PATCH'te alan yok = dokunma, `null` = temizle                                          |
| `PATCH /admin/hero-slides/reorder { ids }`                                   | Tek yerleşim; dizi sırası = `displayOrder`                                             |
| `GET` · `PATCH /admin/hero-slides/visibility { web?, app? }`                 | Ana sayfa anahtarları `{ web, app }`; alan yok = dokunma. Yazım `home:hero`'yu tazeler |
| `POST /admin/hero-slides/upload` (multipart `file`)                          | jpeg/png/webp, 5 MB, `products/hero/`, en çok 2400 px en → `{ url }`                   |
| `/admin/trust-badges` (GET, GET `:id`, POST, PATCH, DELETE, `PATCH reorder`) | Aynı desen, yükleme yok; metin ham (belirteçli) döner                                  |

Her yazım admin denetim kaydına (`hero_slide_*`, `hero_visibility_update`, `trust_badge_*`,
önce/sonra) yazılır. Anahtar kaydı yalnız gerçekten değişen ayar satırı için, satırın kendi
kimliğiyle düşülür; web etiketi yalnız `web` anahtarı değişince tazelenir.

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

Her yazımdan sonra `notifyWebRevalidate`: ana sayfa slaytı ve ana sayfa anahtarı → `home:hero`,
auth slaytları → `auth:hero`, rozetler → `home:trust`. Yerleşim değişirse iki etiket birden.

Çağrının ulaşması için API'de `WEB_REVALIDATE_URL` (web kökü — API `/api/revalidate` ekler — ya da
tam uç) ve web ile AYNI `REVALIDATE_SECRET` gerekir; reddedilen/ulaşmayan çağrı API logunda
`WebRevalidate` uyarısı bırakır. Ulaşmazsa web değişikliği yedek ISR penceresinde (60 sn) görür.
Mobil, `platform=app` okumasını 60 sn taze tutar; ana sayfa hero'sunu kalıcı (soğuk açılış)
önbelleğe yazmaz (giriş/kayıt görseli yazılır).

## Seed

`prisma/seed-hero-content.ts` (referans katmanı; `seed-production.ts` her açılışta, yerel demo
seed'i de çağırır): eski web sabitlerinden ana sayfa slaytı, iki auth görseli ve altı rozet —
**yalnız ilk kurulumda bir kez**. İşaret PlatformSetting `hero_seed_applied`: varsa seed hiçbir
şey yazmaz; yoksa ama hero/rozet satırı varsa (işaretten önceki kurulum) yalnız işareti yazar;
ikisi de yoksa içeriği ve işareti tek işlemde yazar (yarıda kesilen ilk kurulum hiçbir şey
bırakmaz, sonraki açılış baştan kurar). Sabit kimlik + `update: {}` — admin düzenlemesi
ezilmez, bilerek boşaltılan yerleşim (ya da silinen seed slaytı) geri gelmez.
