# Search Bölümü – Analiz ve Eksikler

Plana göre **Search** kategorisinde 3 sayfa/özellik var. Mevcut durum ve yapılacaklar aşağıda.

---

## 1. Advanced Search Page (Gelişmiş Arama)

**Plan:** "Detailed search filters, multiple criteria, save search"  
**Not (sarı):** "son aranılanlar yok"

### Mevcut durum
- **/search** – Arama metni (q), kategori, fiyat (min/max), durum, takas, sıralama. "Did you mean?" önerileri var. **Son aranılanlar (recent searches) bu sayfada yok.**
- **/listings** – Daha zengin filtreler (marka, ölçek, materyal, indirim, vb.) + **son aranılanlar** dropdown (focus’ta). Save search yok burada.
- **/saved-searches** – Kayıtlı aramalar (localStorage), listele/sil/çalıştır. Giriş gerekli.

### Eksik / yapılacak
- **Son aranılanlar:** `/search` sayfasında da "son aranılanlar" listesi gösterilmeli (Navbar ve listings’teki gibi). Ya aynı store (recentSearchesStore) kullanılır ya da search sayfasına özel bir blok eklenir; arama yapıldığında bu listeye eklenir.
- İsteğe bağlı: "Bu aramayı kaydet" butonu `/search` sonuç ekranında da olabilir (şu an sadece saved-searches sayfası var).

**Özet:** Advanced Search büyük ölçüde var; eksik olan **/search sayfasında "son aranılanlar"** (plan notundaki "son aranılanlar yok" ile uyumlu).

---

## 2. Compare Products Page (Ürün Karşılaştırma)

**Plan:** "Side-by-side comparison, specs table, price comparison, add to cart"  
**Durum:** Kırmızı – **yok, sıfırdan yapılacak.**

### Yapılacaklar
- **Sayfa:** `/compare` (veya `/compare-products`).
- **Mantık:** Kullanıcı ürün kartlarından "Karşılaştırmaya ekle" ile 2–4 ürün seçer; seçilenler bir store/localStorage’da tutulur. Compare sayfası bu listeyi yan yana (veya tablo) gösterir.
- **İçerik:** Yan yana: görsel, başlık, fiyat, özellikler (ölçek, marka, durum, vb.), "Sepete ekle" butonu. Specs tablosu (ortak alanlar satır, ürünler sütun).
- **Teknik:** Compare store (örn. `compareStore`: productIds[], add, remove, clear). Ürün detay ve liste sayfalarında "Karşılaştırmaya ekle" butonu. Compare sayfası bu ID’lere göre ürünleri çeker, tablo/layout ile gösterir.

---

## 3. Recently Viewed Page (Son Görüntülenenler)

**Plan:** "User's browsing history, quick re-access, clear history"  
**Durum:** Kırmızı – **yok, sıfırdan yapılacak.**

### Yapılacaklar
- **Takip:** Ürün detay sayfasına girildiğinde o ürün "son görüntülenenler"e eklenir (localStorage veya API). Kapalı liste (örn. son 20–30 ürün), tekrar eden ziyarette güncel konuma taşınır.
- **Sayfa:** `/recently-viewed` (veya `/recent`). Liste: kartlar veya kompakt liste; tıklanınca ürün detayına gider. "Geçmişi temizle" butonu.
- **Erişim:** Navbar veya profil/footer’da "Son görüntülenenler" linki (i18n: zaten `recentlyViewed` var).

**Özet:** Store (örn. `recentlyViewedStore`: productIds[], add on product view, clear), tek sayfa, temizle butonu.

---

## Öncelik Sırası (Öneri)

1. **Son aranılanlar /search’te** – Küçük ekleme, plan notunu giderir.
2. **Recently Viewed** – Store + tek sayfa + "temizle"; bağımsız ve anlaşılır.
3. **Compare Products** – Store + "Karşılaştırmaya ekle" butonları + compare sayfası; biraz daha iş.

İstersen sırayla: önce 1, sonra 2, sonra 3 ile ilerleyebiliriz.
