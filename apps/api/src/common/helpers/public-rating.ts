import { Prisma, RatingStatus } from "@prisma/client";

/**
 * Herkese açık yüzeylerde "yayınlanmış puan" = YALNIZ `approved`.
 *
 * Ürün kartındaki sayaç/ortalama, ürün detayındaki yorum listesi, arama
 * dokümanı ve satıcı puanı hep bu tek tanımdan beslenmek zorundadır. Bir
 * yüzey filtreyi atlarsa kartta görünen ama detayda/listede olmayan "hayalet
 * yorum" doğar: post-moderasyonda admin bir yorumu kaldırdığında (ya da fixture
 * verisi `pending` kaldığında) sayaç düşmez, kullanıcı tıklayınca boş liste
 * bulur.
 *
 * Ürün için cache kolonları (Product.averageRating / ratingCount) da bu
 * kuralın türevidir — RatingService.updateProductRatingStats onları yalnız
 * approved satırlardan hesaplar.
 */
export const PUBLIC_RATING_STATUS = RatingStatus.approved;

/**
 * ProductRating (ürün yorumu) — herkese açık her sorgunun taban filtresi.
 * `status` bilerek EN SONA yazılır: çağıranın gönderdiği bir status'u ezer,
 * böylece "public" yolda onaysız satır sızdıran bir where mümkün olmaz.
 */
export const publicProductRatingWhere = (
  where: Prisma.ProductRatingWhereInput = {},
): Prisma.ProductRatingWhereInput => ({
  ...where,
  status: PUBLIC_RATING_STATUS,
});

/** Rating (satıcı puanı) — herkese açık her sorgunun taban filtresi. */
export const publicUserRatingWhere = (
  where: Prisma.RatingWhereInput = {},
): Prisma.RatingWhereInput => ({
  ...where,
  status: PUBLIC_RATING_STATUS,
});
