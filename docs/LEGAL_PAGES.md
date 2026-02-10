# Legal Pages (Yasal Sayfalar)

Bu doküman, TARODAN web sitesindeki yasal sayfaların listesini ve yapısını özetler.

## Sayfa listesi

| Sayfa | Route | İçerik özeti | Hedef kitle |
|-------|--------|---------------|-------------|
| Gizlilik Politikası | `/privacy` | Veri toplama, kullanım, paylaşım, çerezler, KVKK/GDPR hakları | Tüm kullanıcılar |
| Kullanım Şartları | `/terms` | Kullanım sözleşmesi, kurallar, sorumluluk, pazar yeri kuralları | Tüm kullanıcılar |
| Çerez Politikası | `/cookies` | Çerez türleri, kullanım, yönetim, onay | Tüm kullanıcılar |
| Mesafeli Satış Sözleşmesi | `/distance-sales` | Taraflar, konu, ön bilgilendirme, cayma hakkı, iade | Tüm kullanıcılar |
| İade Politikası | `/refund-policy` | İade koşulları, süreç, süre, istisnalar | Tüm kullanıcılar |
| Satıcı Sözleşmesi | `/seller-agreement` | Satıcı şartları, komisyon, kurallar, yasak ürünler, hesap askıya alma | Satıcılar |
| Alıcı Koruma | `/buyer-protection` | Alıcı koruma, anlaşmazlık çözümü, para iade süreci | Alıcılar |
| Fikri Mülkiyet | `/intellectual-property` | Telif, marka, ihlal bildirimi (DMCA uyumlu süreç) | Tüm kullanıcılar |

## Teknik notlar

- Tüm sayfalar aynı yapıyı kullanır: hero (başlık + son güncelleme), beyaz kart içerik (prose), sayfa sonunda ilgili diğer legal sayfalara linkler.
- Başlıklar i18n üzerinden gelir: `legal.privacyTitle`, `legal.termsTitle`, vb.
- İçerik metinleri şu an sayfa bileşenlerinde Türkçe sabit; dil değişince başlık çevrilir, gövde metinleri ileride i18n’e taşınabilir.

## Hukuki uyum

- **Yapı:** Bu tür sayfalar (gizlilik, kullanım şartları, çerez, iade, satıcı sözleşmesi, alıcı koruma, fikri mülkiyet) profesyonel e-ticaret / pazar yerlerinde standarttır; bölüm başlıkları ve akış benzerdir.
- **Metinler:** Sitedeki metinler taslak / şablon niteliğindedir. Nihai hukuki metinlerin, Türkiye mevzuatına (KVKK, Tüketici Kanunu, Mesafeli Sözleşmeler Yönetmeliği vb.) ve şirket koşullarına uygun olarak **şirket veya hukuk danışmanı tarafından gözden geçirilmesi ve gerekirse güncellenmesi önerilir.**

## Footer

Legal sütununda tüm yukarıdaki sayfalara link verilir (`Footer.tsx` → `FOOTER_LINKS.legal`).
