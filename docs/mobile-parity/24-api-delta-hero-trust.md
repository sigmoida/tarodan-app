# 24 — API Değişiklik Güncesi (2026-10-12): Vitrin hero'su ve güven rozetleri

> **Bu dosya bir delta raporudur.** Önceki günce `23-api-delta-2026-10-05-legal-identity.md`.
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
GET  /hero-slides?placement=home|auth_default|auth_register   → HeroSlideDto[]
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
}
```

- `placement` zorunlu; bilinmeyen değer `400`. Liste zaten yayındakiler (açık + tarih
  penceresinde), `displayOrder` sırasıyla ve en çok 5 öğe; istemci yeniden süzmez/sıralamaz.
- `Cache-Control: public, max-age=60` — zamanlanmış slayt en geç bir dakikada görünür.
- `placement=home` için sunucu, slider'ı boş bırakacak değişikliği reddeder (silme, kapatma,
  bitiş tarihi verme, native'de gizleme; ileri tarihli bitişler ve `hideOnIos` hesaba katılır).
  Yine de tarihi kendiliğinden biten son slayt listeyi boşaltabilir: istemci boş `home` listesine
  hazırlıklı olmalı. Auth yerleşimi boş dönebilir: görsel paneli gizleyin.
  Mobil native listede `hideOnIos: true` olanlar süzülür (aşağıda §3); sunucu koruması bunu bilir,
  ama süzmeyi yine istemci yapar.

## 2. Dil seçimi

Her metin iki dili birden taşır. Kural (`pickLocalized`): uygulama dili `en` ve `en` dolu ise
`en`, aksi halde `tr`. Değer `null` ise metni/öğeyi göstermeyin. Başlıktaki `\n` elle satır
sonudur (web `whitespace-pre-line`).

## 3. Görsel ve yerleşim

- Görsel: **`mobileImageUrl ?? imageUrl`**.
- `imageSide` geniş ekran (tablet yatay) içindir; telefonda görsel üstte, metin altta.
- Erişilebilirlik etiketi `imageAlt`, yoksa başlık.
- **`hideOnIos: true` olan slaytı iOS'ta göstermeyin** (Android'de gösterin). Bu süzme
  istemcidedir; sunucu platform bilmez.

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
- Liste admin sırasıyla gelir; web 6 sütun, telefonda 3 sütun ızgara.
