# Mobil UI Kapsama İndeksi

50 yolculuğun **mobil-UI** adımlarının test izlenebilirliği. Backend mantığı API e2e'de (ayrı). Durum: ✅ test var · 🚧 mobil ürün-eksiği (test edilemez) · — backend-only (UI adımı yok).

| Yolculuk | UI adımı | Test (dosya::describe) | Durum |
|---|---|---|---|
| J41 | şifre kuralları | src/utils/__tests__/validation.test.ts::J41 | ✅ |
| J42 | 18 yaş engeli | src/utils/__tests__/validation.test.ts::J42 | ✅ |
| J43 | aynı email reddi (mesaj gösterimi) | app/(auth)/__tests__/register.test.tsx::J43 | ✅ |
| J44 | yanlış şifre hata banner | app/(auth)/__tests__/login.test.tsx::J44 | ✅ |
| J3/J4 | teklif validasyonu | src/components/product/__tests__/MakeOfferModal.test.tsx | ✅ |
| J23/J47 | 2FA durum/toggle | app/settings/__tests__/security.test.tsx | ✅ |

## Sonraki domain batch'leri (ayrı plan)
- Checkout (J1 sepet özeti, 3-adım buton) · Sepet/wishlist (J21/J33) · Bildirim/profil/adres (J32/J38) · Kupon (J22) · IBAN format (J50).

## Mobil ürün-eksikleri (🚧 — test yazılmaz)
- İlan foto zorunlu: J2, J15, J18, J30, J40, J50
- IBAN ekranı yok: J2, J27, J40, J50
- Teklif siparişi ödeme entry yok: J3, J34, J40
(Detay: mobile-gaps-from-journey-automation.md)
