# Information sayfaları – plan ve yaklaşım

## Resmi API ihtiyacı

- **Kargo / ödeme “resmi API”**: Bu sayfalar **bilgilendirme** sayfası. Kullanıcıya “nasıl kargolanır, hangi ödeme yöntemleri kabul edilir” metnini anlatıyoruz; canlı kargo takip veya ödeme işlemi bu sayfalarda yapılmıyor.
- **Shipping & Delivery**: Metin (yöntemler, süreler, maliyet). “Sipariş takibi” için mevcut **Siparişi takip et** / `track-order` sayfasına link verilir. İleride carrier API entegre edilirse sadece checkout/track-order tarafı değişir; bilgi sayfası aynı kalabilir.
- **Payment Options**: Kabul edilen yöntemler, güvenlik, taksit bilgisi **metin** olarak yazılır. Ödeme işlemi zaten checkout’ta (iyzico vb.); bu sayfa sadece bilgi.
- **Sonuç**: Tüm Information sayfaları **resmi kargo/ödeme API’sine ihtiyaç duymadan** yapılabilir. İçerik statik (veya ileride CMS/`sayfa/[slug]`) ile güncellenir.

## Legal / profesyonel

- **Yasal metinler** (iade koşulları, mesafeli satış, KVKK): Nihai metni hukukçu / şirket hazırlar; biz sayfa yapısını, dil seçimini ve linkleri sağlar. Placeholder metin “buraya hukuki metin gelecek” şeklinde bırakılabilir veya genel taslak yazılır.
- **Optimal**: Her sayfa tek tip layout (başlık, bölümler, TR/EN), footer’dan erişilebilir. İçerik i18n veya `sayfa/[slug]` (API) ile yönetilebilir.

## Plan tablosu (Information)

| Sayfa | İçerik (plana göre) | Mevcut | Yapılacak |
|-------|---------------------|--------|-----------|
| About Us | Company story, mission, team, values, milestones | Yok | `/about` – statik/i18n |
| Contact Us | Form, email, phone, address, social, map | Form var | Adres/telefon/sosyal + isteğe map embed |
| FAQ | Kategorili SSS, arama, açılır soru-cevap | Var | İyileştirme isteğe bağlı |
| Help Center | Konular, rehberler, arama | Var (help + guides) | İsteğe bağlı |
| Shipping & Delivery | Yöntemler, maliyet, süre, uluslararası, takip linki | Yok | `/shipping-delivery` – statik, takip = link |
| Returns & Exchanges | İade süreci, değişim, süre, koşullar | Yok | `/returns-exchanges` – statik |
| Payment Options | Kabul edilen yöntemler, güvenlik, taksit | Yok | `/payment-options` – statik |
| Security Features | Önlemler, alıcı koruma, güvenli ödeme, veri gizliliği | Yok | `/security-features` veya mevcut güvenlik sayfası |
| Size Guide | Ölçek karşılaştırma, ölçüler, açıklamalar | Yok | `/size-guide` – statik (ölçek tablosu) |
| Authenticity Guarantee | Doğrulama süreci, sahtecilik önlemi, rozetler | Yok | `/authenticity` – statik |
| Collector's Guide | İpuçları, derecelendirme, saklama, değerleme | Yok | `/collectors-guide` – statik |

## Teknik

- Yeni sayfalar: `apps/web/src/app/<route>/page.tsx`.
- İçerik: `i18n/messages/tr.json` ve `en.json` içinde `information.*`.
- Footer “Destek” bölümünde: Hakkımızda (/about), Yardım, SSS (/faq), İletişim, Kılavuzlar, Kargo ve Teslimat (/shipping-delivery), Ödeme Seçenekleri (/payment-options), İade ve Değişim (/returns-exchanges).

## Yapılanlar (ilk tur)

- **About Us** – `/about`: Hikaye, misyon, değerler (i18n).
- **Contact** – İletişim bilgileri bloğu eklendi (e-posta, telefon, adres; i18n).
- **Shipping & Delivery** – `/shipping-delivery`: Yöntemler, maliyet, süre, takip (link /track-order).
- **Payment Options** – `/payment-options`: Kabul edilen yöntemler, güvenlik, taksit.
- **Returns & Exchanges** – `/returns-exchanges`: İade politikası, süreç, süre.
- FAQ ve Help zaten vardı; footer linkleri /about, /faq olarak güncellendi.
- **Security Features** – `/security-features`: Güvenlik önlemleri, alıcı koruması, veri gizliliği.
- **Size Guide** – `/size-guide`: Ölçek rehberi, tablo (1:18, 1:24, 1:43, 1:64), yaklaşık boyut ve notlar.
- **Authenticity Guarantee** – `/authenticity`: Doğrulama süreci, sahtecilik önlemi, rozetler.
- **Collector's Guide** – `/collectors-guide`: Koleksiyon ipuçları, derecelendirme, saklama, değerleme.
- Footer’a Security, Size Guide, Authenticity, Collector’s Guide linkleri eklendi.

---
*Kargo/ödeme canlı API’leri sadece checkout ve sipariş takip akışında kullanılır; Information sayfaları sadece metin ve link içerir.*
