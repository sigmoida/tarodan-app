# 24 — API Değişiklik Güncesi (2026-10-12): Vitrin hero'su ve güven rozetleri

> **Bu dosya bir delta raporudur.** Önceki günce `23-api-delta-2026-10-05-legal-identity.md`.
> **Güncelleme 2026-10-16:** hero'ya platform hedefi ve ana sayfa anahtarı eklendi — §7.
> Kalıcı referans: **`docs/HERO_CMS.md`** (model, kurallar, admin uçları).
> Tip sözleşmesi: `@tarodan/types` → `hero.ts`, `localized-text.ts`.

Ana sayfa slider'ı, giriş/kayıt ekranının görseli ve ana sayfa güven rozetleri artık
admin'den yönetilir; web ve mobil **aynı** içeriği gösterir. Kodda yedek slayt yoktur: mobil
gömülü slayt/rozet listelerini kaldırıp bu uçlardan okumalıdır. Mobil UI bu repoda yapılmaz;
aşağıdakiler sözleşmedir. Mevcut mobil sürümü kırmaz (yeni uçlar, eski uçlar değişmedi).

## Öncelikli uygulama özeti

| Öncelik | Mobil değişiklik                                                                        | Yapılmazsa                                                |
| ------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **P0**  | Ana sayfa slider'ını `GET /hero-slides?placement=home`'dan çiz; gömülü slaytları kaldır | Admin'in değişiklikleri mobilde görünmez, web ile ayrışır |
| P1      | Rozet şeridini `GET /trust-badges`'ten çiz                                              | Rozetler ve iade süresi web'den ayrışır                   |
| P1      | Gösterim/tık beacon'ları (`impression`, `click?cta=`)                                   | Admin istatistiği yalnız web'i sayar                      |
| P2      | Auth ekranında görsel varsa `auth_default` / `auth_register` slaytını kullan            | —                                                         |

## 1. Uçlar (hepsi public, oturum gerekmez)

```
GET  /hero-slides?placement=home|auth_default|auth_register&platform=app   → HeroSlideDto[]
GET  /trust-badges                                            → TrustBadgeDto[]
POST /hero-slides/:id/impression                              → 204
POST /hero-slides/:id/click            (slayt görseline dokunuş) → 204
POST /hero-slides/:id/click?cta=1|2    (butona dokunuş)          → 204
```

```ts
interface LocalizedText {
  tr: string;
  en?: string | null;
}
interface HeroSlideDto {
  id: string;
  placement: "home" | "auth_default" | "auth_register";
  imageUrl: string;
  mobileImageUrl: string | null;
  imageSide: "left" | "right";
  title: LocalizedText;
  subtitle: LocalizedText | null;
  imageAlt: LocalizedText | null;
  cta1: { label: LocalizedText; href: string } | null;
  cta2: { label: LocalizedText; href: string } | null;
  hideOnIos: boolean;
  platform: "web" | "app" | "all"; // 2026-10-16
}
interface TrustBadgeDto {
  id: string;
  icon:
    | "shield-check"
    | "truck"
    | "arrow-path"
    | "credit-card"
    | "rectangle-stack"
    | "arrows-right-left";
  title: LocalizedText;
  description: LocalizedText | null;
  hideOnIos: boolean; // native'de (iOS + Android) gizle; web yok sayar
}
```

- `placement` zorunlu; bilinmeyen değer `400`. Liste zaten yayındakiler (açık + tarih
  penceresinde), `displayOrder` sırasıyla ve en çok 5 öğe; istemci yeniden süzmez/sıralamaz.
- `Cache-Control: public, max-age=60` — zamanlanmış slayt en geç bir dakikada görünür.
- **Her yerleşim boş dönebilir** (2026-10-16'dan beri ana sayfa da): boş listede slider'ı /
  görsel paneli hiç çizmeyin (iskelet ya da boş alan bırakmayın).

## 2. Dil seçimi

Her metin iki dili birden taşır. Kural (`pickLocalized`): uygulama dili `en` ve `en` dolu ise
`en`, aksi halde `tr`. Değer `null` ise metni/öğeyi göstermeyin. Başlıktaki `\n` elle satır
sonudur (web `whitespace-pre-line`).

## 3. Görsel ve yerleşim

- Görsel: **`mobileImageUrl ?? imageUrl`**.
- `imageSide` geniş ekran (tablet yatay) içindir; telefonda görsel üstte, metin altta.
- Erişilebilirlik etiketi `imageAlt`, yoksa başlık.
- **`hideOnIos: true` olan slaytı native uygulamada göstermeyin** (iOS VE Android; 2026-10-12
  kararı: dijital satış native'de iki mağazada da kapalı). Alan adı geriye uyum için `hideOnIos`
  kaldı, anlamı "native'de gizle"dir. Bu süzme istemcidedir; sunucunun `platform` süzmesi
  web/uygulama ayrımıdır (§7), iOS/Android değil; web alanı yok sayar. Aynı bayrak güven rozetlerinde de vardır (`TrustBadgeDto.hideOnIos`, §6).

## 4. Butonlar ve bağlantılar

`cta1`/`cta2` yalnız etiket ve bağlantı birlikte varsa gelir. `href` mutlak `http(s)` URL ya
da tek `/` ile başlayan site içi yoldur — reklam bağlantısıyla aynı kural. Açmak için mevcut
**`openAdLink`** kullanılır (site içi yol → uygulama içi rota, mutlak URL → tarayıcı).

## 5. Sayaçlar

- Slayt ekranda ilk göründüğünde `POST /hero-slides/:id/impression` (ateşle-unut).
- Görsele dokunuş: `POST /hero-slides/:id/click`; butona dokunuş: `…/click?cta=1` veya `?cta=2`
  (sunucu slayt toplamını ve buton sayacını birlikte artırır — iki istek ATMAYIN).
- Gövde yok. Yanıt daima 204: tekrar (IP başına gösterim 30 dk, tık 10 sn), yayında olmayan
  slayt, olmayan buton ya da geçersiz `cta` sessizce yok sayılır. İstemci IP'si başına 60/dk.

## 6. Güven rozetleri

- `icon` sabit listedir (heroicons outline adları); mobil kendi ikon setine eşler, **bilinmeyen
  anahtarlı rozeti göstermez** (liste ileride büyüyebilir).
- Metindeki süreler (ör. iade günü) sunucuda Süreler ve Kurallar'dan doldurulmuş gelir; mobil
  `{…}` belirteci işlemez.
- `hideOnIos: true` rozeti mobil uygulama göstermez (iOS ve Android); web yok sayar. Alan
  eklemedir: eski istemci yok sayar, `false` varsayılandır.
- Liste admin sırasıyla gelir; web 6 sütun, telefonda 3 sütun ızgara.

## 7. Güncelleme 2026-10-16 — platform hedefi ve ana sayfa anahtarı

Geriye uyumlu: yanıt şekli (çıplak dizi) aynı, eski sürümler değişiklik yapmadan çalışır.

- **`?platform=web|app`** — yeni sürüm her `GET /hero-slides` isteğine **`platform=app`**
  ekler. Parametre yoksa sunucu `app` varsayar (parametresiz tek istemci eski mobil
  sürümlerdir); `all` ya da başka değer `400`.
- Sunucu yalnız `platform` ∈ {`app`, `all`} slaytları döner — `web`'e özel slaytlar mobilde
  görünmez. Her slayt yeni **`platform`** alanını taşır (bilgi amaçlı; istemci yeniden
  süzmez).
- **Ana sayfa anahtarı:** admin hero'yu uygulamada kapatırsa (`hero_home_enabled_app` =
  `false`) `placement=home&platform=app` **`[]`** döner → slider hiç çizilmez. Anahtar yalnız
  ana sayfa içindir; auth yerleşimleri yalnız platformla süzülür. Mobil anahtarı okumaz —
  boş liste yeterli sinyaldir.
- Yerleşim artık bilerek boşaltılabilir (son slayt silinebilir/kapatılabilir): boş liste
  normal durumdur, hata değildir.
- `hideOnIos` aynen geçerli (sunucu süzmesinden sonra istemcide).
