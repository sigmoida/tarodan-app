/** @format */

/**
 * `fill` ile yerleştirilen görsellerin `sizes` değerleri — TEK kaynak.
 *
 * `sizes`, tarayıcıya "bu görsel ekranda kaç piksel yer kaplayacak" der; srcset
 * içinden hangi boyutun indirileceğini o belirler. Verilmezse `OptimizedImage`
 * `(max-width: 768px) 100vw, …` varsayıyor — yani telefonda görselin ekranın
 * TAMAMINI kapladığını. İki sütunlu bir ızgarada bu, gereken çözünürlüğün iki
 * katını indirmek demek.
 *
 * Sabit ölçülü kutular (`w-16`, `h-12` …) için burada bir sabit yok: oralarda
 * `sizes="64px"` gibi doğrudan yazmak hem daha kısa hem de kutunun ölçüsüyle
 * birlikte değişmesi gerektiğini yerinde gösteriyor. Buradakiler, birden çok
 * sayfada tekrarlanan IZGARA düzenleri.
 */
export const IMAGE_SIZES = {
  /** 2 → 3 → 4 sütun: ilan listesi, favoriler, ilgili ürünler, profil ilanları. */
  productGrid: "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw",

  /** 2 → 3 → 4 → 5 → 6 sütun: koleksiyon ızgaraları. */
  collectionGrid:
    "(min-width: 1280px) 17vw, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw",

  /** Ürün detayının ana görseli — `lg`de iki sütuna geçer, altında tam genişlik. */
  productHero: "(min-width: 1024px) 50vw, 100vw",

  /** Takas/teklif akışlarındaki iki sütunlu ürün seçici kartları (modal içi). */
  pickerGrid: "(min-width: 640px) 220px, 45vw",
} as const;
