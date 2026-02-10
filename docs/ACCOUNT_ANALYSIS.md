# Account (03 WEBSITE PAGES – Category: Account) – Analiz

CSV’deki Account maddeleri tek tek kontrol edildi. Durum: ✅ Var / ⚠️ Eksik / ❌ Yok.

---

## 1. Registration Page (CSV: Kırmızı)
- **İstenen:** Sign up form, email verification, social login options, terms acceptance
- **Durum:** ⚠️ Eksik
- **Var:** Kayıt formu (displayName, email, phone, birthDate, password, confirmPassword), terms (agreeTerms), kayıt sonrası “e-posta doğrulayın” ekranı, resend verification (register success ekranında)
- **Eksik:** Social login (Google/Facebook vb.)

---

## 2. Login Page (CSV: Kırmızı)
- **İstenen:** Email/password login, social login, remember me, forgot password link
- **Durum:** ⚠️ Eksik
- **Var:** Email/password, remember me, forgot password link, doğrulanmamış kullanıcı için “resend verification” banner
- **Eksik:** Social login

---

## 3. My Account Dashboard (CSV: Yeşil)
- **İstenen:** Overview of orders, wishlist, saved addresses, account stats, quick actions
- **Durum:** ✅ Var
- **Sayfa:** `/profile` – Siparişler, favoriler, adresler, istatistikler, hızlı linkler

---

## 4. My Orders Page (CSV: Sarı)
- **İstenen:** Order history, order status, tracking, reorder, download invoices
- **Durum:** ⚠️ Eksik
- **Var:** Sipariş listesi, durum, buyer/seller filtresi, detay linki, review modal, kargo/tracking numarası gösterimi
- **Eksik:** Reorder butonu, fatura indir, “Siparişi takip et” linki (track-order’a)

---

## 5. Order Detail Page (CSV: Yeşil)
- **İstenen:** Specific order details, items, tracking info, shipping address, invoice
- **Durum:** ⚠️ Eksik
- **Var:** Sipariş detayı, ürünler, adres, shipment (tracking number)
- **Eksik:** Fatura indir butonu, “Siparişi takip et” linki

---

## 6. Order Tracking Page (CSV: Kırmızı)
- **İstenen:** Real-time tracking, delivery status, carrier info, estimated delivery
- **Durum:** ✅ Var (API notu: “api gerekli” – mevcut API yeterli mi ayrı kontrol edilebilir)
- **Sayfa:** `/track-order` – Sipariş no + e-posta ile sorgulama, shipment status, carrier, tracking number. `/orders/track` → `/track-order` redirect.

---

## 7. My Wishlist Page (CSV: Yeşil)
- **İstenen:** Saved products, add to cart, remove, share wishlist
- **Durum:** ⚠️ Eksik
- **Var:** Favoriler listesi (`/favorites`), sepete ekle, kaldır
- **Eksik:** “Listeyi paylaş” (share wishlist)

---

## 8. My Profile Page (CSV: Yeşil)
- **İstenen:** Personal info, profile picture, contact details, preferences
- **Durum:** ✅ Var
- **Sayfa:** `/profile/edit` – displayName, email, phone, birthDate, bio, profil fotoğrafı, (iş hesabı: companyName, taxId, taxOffice)

---

## 9. Address Book Page (CSV: Yeşil)
- **İstenen:** Saved addresses, add/edit/delete, set default shipping/billing
- **Durum:** ✅ Var
- **Sayfa:** `/profile/addresses`

---

## 10. Payment Methods Page (CSV: Yeşil)
- **İstenen:** Saved payment methods, add/remove cards, set default
- **Durum:** ✅ Var
- **Sayfa:** `/profile/payments`

---

## 11. My Reviews Page (CSV: Yeşil)
- **İstenen:** User's product reviews, edit reviews, review history
- **Durum:** ❌ Yok
- **Not:** Siparişler sayfasında “değerlendirme yaz” modalı var; kullanıcının yazdığı tüm değerlendirmeleri listeleyen ayrı bir “My Reviews” sayfası yok.

---

## 12. Account Settings Page (CSV: Yeşil)
- **İstenen:** Email preferences, notifications, privacy settings, language, currency
- **Durum:** ⚠️ Eksik
- **Var:** Bildirim ayarları (email, push, sms, marketing, order updates, message alerts, price drop, new listing), hesap silme, Change Password / 2FA linkleri
- **Eksik:** Dil seçimi (uygulama i18n ile dil değişiyor ama ayarlar sayfasında net “dil” alanı yok), para birimi (CSV’de “currency soru işareti”)

---

## 13. Change Password Page (CSV: Yeşil)
- **İstenen:** Current password, new password, confirm password
- **Durum:** ✅ Var
- **Sayfa:** `/profile/change-password` – Mevcut şifre, yeni şifre, tekrar; gereksinimler (8+ karakter, büyük/küçük/rakam); API: `POST /security/password/change`.

---

## 14. Forgot Password Page (CSV: Yeşil)
- **İstenen:** Email input, send reset link, confirmation message
- **Durum:** ✅ Var
- **Sayfa:** `/forgot-password`

---

## 15. Reset Password Page (CSV: Yeşil)
- **İstenen:** New password entry, confirm password, token validation
- **Durum:** ✅ Var
- **Sayfa:** `/reset-password?token=...`

---

## 16. Email Verification Page (CSV: Kırmızı)
- **İstenen:** Verify email token, success/error message, resend link
- **Durum:** ⚠️ Eksik
- **Var:** `/verify-email?token=...` – token doğrulama, success/error/no-token ekranları
- **Eksik:** Hata ekranında “Yeniden doğrulama e-postası gönder” butonu (resend, login/register’da var; verify-email sayfasında yok)

---

## Özet

| Durum | Sayı | Maddeler |
|-------|------|----------|
| ✅ Tam | 8 | Dashboard, Order Detail (kısmen), Order Tracking, Profile, Address Book, Payment Methods, Forgot Password, Reset Password |
| ⚠️ Eksik | 6 | Registration (social), Login (social), My Orders (reorder, invoice, track link), Order Detail (invoice, track), Wishlist (share), Email Verification (resend on page), Account Settings (language/currency) |
| ❌ Yok | 2 | Change Password sayfası, My Reviews sayfası |

---

## TODO (Yapılacaklar)

1. **Change Password sayfası** – `/profile/change-password` oluştur (mevcut şifre, yeni şifre, tekrar); API hazır.
2. **My Orders** – Reorder butonu, fatura indir, “Siparişi takip et” linki.
3. **Order Detail** – Fatura indir butonu, “Siparişi takip et” linki.
4. **My Wishlist** – “Listeyi paylaş” (link kopyala veya paylaşım UI).
5. **Email Verification** – Hata ekranına “Yeniden gönder” butonu ekle.
6. **Account Settings** – Dil seçimi (ve istenirse para birimi).
7. **My Reviews sayfası** – Kullanıcının yazdığı değerlendirmeleri listeleme sayfası (`/profile/reviews` veya benzeri).
8. **Social login** (opsiyonel) – Registration ve Login’e Google/Facebook vb.

İlerleme: Adım adım yukarıdaki TODO’lar uygulanacak.
