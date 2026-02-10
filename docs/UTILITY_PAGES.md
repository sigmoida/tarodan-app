# Utility Pages

Bu doküman, plandaki "Utility" sayfalarının listesi ve teknik notları içerir.

## Sayfa listesi

| Sayfa | Route | Açıklama | Hedef |
|-------|--------|----------|--------|
| **Site Haritası** | `/sitemap` | HTML sitemap; tüm sayfa linkleri kategorilere göre (Pazar, Satış, Hesap, Destek, Yasal) | Tüm kullanıcılar |
| **404** | (otomatik) | Özel 404: arama çubuğu, popüler kategoriler, ana sayfa linki | Tüm kullanıcılar |
| **500 / Hata** | (otomatik) | `error.tsx`: sunucu/hata mesajı, yenile, destek ile iletişim | Tüm kullanıcılar |
| **Global 500** | (otomatik) | `global-error.tsx`: root layout hatalarında tam sayfa hata ekranı | Tüm kullanıcılar |
| **Bakım** | `/maintenance` | Bakım mesajı, tahmini süre, sosyal medya linkleri | Tüm kullanıcılar |
| **Yakında** | `/coming-soon` | Pre-launch: e-posta kayıt, geri sayım, sosyal medya | Tüm kullanıcılar |

## Teknik notlar

- **Sitemap:** `app/sitemap/page.tsx` → `/sitemap`. XML sitemap ayrı: `app/sitemap.ts` → `/sitemap.xml`.
- **404:** Next.js App Router `app/not-found.tsx`; arama `/listings?search=...` ile yönlendirir.
- **500:** `app/error.tsx` segment/runtime hatalarını yakalar; "Sayfayı Yenile" ve "Destek ile İletişim" (/contact) butonları.
- **Global 500:** `app/global-error.tsx` kendi `<html>` ve `<body>` tanımlar; root layout hatalarında kullanılır.
- **Maintenance / Coming Soon:** Normal sayfa route’ları; bakım modu için ileride middleware veya env ile yönlendirme eklenebilir.

## i18n

Tüm metinler `utility.*` altında: `utility.sitemap.*`, `utility.notFound.*`, `utility.error500.*`, `utility.maintenance.*`, `utility.comingSoon.*`. TR ve EN tanımlı.

## Footer

Site haritası linki footer Destek sütununda: "Site Haritası" → `/sitemap`.
