# Marketing Pages

Bu doküman, plandaki "Marketing" sayfalarının listesi ve teknik notları içerir.

## Sayfa listesi

| Sayfa | Route | Açıklama | Hedef |
|-------|--------|----------|--------|
| **Newsletter Signup** | `/newsletter` | E-posta formu, faydalar, tercihler (bülten / kampanya), onay mesajı | Tüm kullanıcılar |
| **Newsletter Unsubscribe** | `/newsletter/unsubscribe` | Token ile (e-posta linki) veya e-posta formu ile abonelikten çıkış, isteğe bağlı geri bildirim | Tüm kullanıcılar |

## API

- **POST /api/newsletter/subscribe** – Misafir bülten aboneliği. Body: `{ email, newsletter?, promotions? }`. Kayıt `newsletter_subscribers` tablosunda tutulur; her abone için `unsubscribe_token` üretilir.
- **GET /api/newsletter/unsubscribe?token=xxx** – E-postadaki link ile abonelikten çıkış (token zorunlu).
- **POST /api/newsletter/unsubscribe** – E-posta ile abonelikten çıkış. Body: `{ email }`.

## Veritabanı

- **newsletter_subscribers**: id, email (unique), newsletter, promotions, unsubscribe_token, unsubscribed_at, created_at, updated_at.
- Migration: `20260210000000_add_newsletter_subscribers`.

## Kayıtlı kullanıcılar

- Bülten tercihi **hesap ayarlarından** yönetilir: `/profile/settings` → "Pazarlama E-postaları" (marketingEmails). API: User.acceptsMarketingEmails.
- Haftalık bülten e-postası `MarketingSchedulerService` ile **User** (acceptsMarketingEmails=true) listesine gider. İleride guest aboneler (NewsletterSubscriber, unsubscribed_at=null) de aynı veya ayrı kampanyada kullanılabilir; e-postalarda abonelikten çıkış linki `?token=...` ile `/newsletter/unsubscribe` olmalı.

## Footer

- Destek sütununda "Bülten" linki → `/newsletter`.

## i18n

- Tüm metinler `marketing.newsletter.*` (TR/EN) altında; başlık, faydalar, form etiketleri, başarı mesajları, abonelikten çıkış metinleri.
