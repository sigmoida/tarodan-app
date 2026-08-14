import { BadRequestException } from "@nestjs/common";
import { i18nMessage } from "../../i18n";

/**
 * İlan başına MUTLAK görsel tavanı — üyelik katmanından bağımsız üst sınır.
 *
 * TEK kaynak: create DTO'su (@ArrayMaxSize), upload endpoint'i (FilesInterceptor)
 * ve admin katman DTO'ları (maxImagesPerListing @Max) hep bu sabiti kullanır.
 * Eskiden üç yerde ayrı hardcode'du (15/15/20): admin bir katmana 20 görsel hakkı
 * tanıyabiliyor, ürün DTO'su ise 16. görseli kafa karıştıran bir mesajla
 * reddediyordu. Gerçek (katmana bağlı) limit runtime'da doğrulanır
 * (assertValidProductImages); bu sabit yalnız tavandır.
 */
export const MAX_PRODUCT_IMAGES = 15;

/**
 * İlan görseli anahtarlarının doğrulanması — create ve update için TEK kural.
 *
 * `cardKey`/`detailKey` istemciden gelir ve doğrudan veritabanına yazılır.
 * Anahtarların gerçekten İSTEĞİ YAPAN kullanıcının yüklemesinden geldiği
 * kanıtlanmıyordu: başkasının anahtarını gönderen bir istek o görseli kendi
 * ilanına iliştirebiliyor, uydurma bir anahtar ise kırık görselli ilan
 * üretebiliyordu. Adet sınırı da yalnız create'te uygulanıyordu; düzenleme
 * yolundan üyelik sınırının üstüne çıkmak mümkündü.
 *
 * Sahiplik kanıtı anahtarın KENDİSİNDEDİR: yeni yüklemeler kullanıcıya ait bir
 * klasöre iner (`product-images/temp/u/{userId}/`). Böylece ayrı bir tablo ya da
 * migration gerekmeden anahtarın sahibi okunabilir.
 */

/**
 * Yüklemenin ineceği klasör — sahiplik bu yolda kodlanır.
 *
 * `temp/` ALTINDA durur: temizlik cron'u yalnız bu öneki tarar. Kullanıcı
 * klasörleri `temp/` dışına alındığında cron'un tüm ürün görsellerini taraması
 * gerekiyordu — canlı her görsel için referans sorgusu (N+1) demekti.
 */
export function productImageFolder(userId: string): string {
  return `product-images/temp/u/${userId}`;
}

/** Anahtar bu kullanıcının yükleme klasöründen mi geliyor? */
export function isOwnedProductImageKey(key: string, userId: string): boolean {
  return key.includes(`/${productImageFolder(userId)}/`);
}

/** Beklenen genel biçim — depolama önekini ve ürün görselleri yolunu taşımalı. */
const PRODUCT_IMAGE_PATH = "/products/product-images/";
const SAFE_KEY = /^[A-Za-z0-9._/-]+$/;

export interface ProductImageInput {
  cardKey: string;
  detailKey: string;
}

export interface ValidateProductImagesOptions {
  /** İsteği yapan kullanıcı — sahiplik bununla karşılaştırılır. */
  userId: string;
  /** Üyelik katmanının izin verdiği adet. */
  maxImages: number;
  /** Sınır mesajında görünen katman adı. */
  tierName: string;
  /**
   * Bu ürüne HÂLEN bağlı anahtarlar. Düzenlemede kullanıcı kendi eski
   * görsellerini geri gönderir; onlar yeni şemada olmasa da geçerlidir.
   * Böylece şema değişikliği eski ilanların düzenlenmesini kırmaz.
   */
  existingKeys?: Set<string>;
}

/**
 * Görsel listesini doğrula: adet, tekrar, biçim ve sahiplik.
 *
 * Sıra AUTHORITATIVE'dir ve burada değiştirilmez — çağıran `sortOrder`ı
 * dizinin sırasından üretir.
 */
export function assertValidProductImages(
  images: ProductImageInput[] | undefined | null,
  options: ValidateProductImagesOptions,
): void {
  if (!images?.length) return;

  if (images.length > options.maxImages) {
    throw new BadRequestException(
      i18nMessage("server.product.imageLimitExceeded", {
        tierName: options.tierName,
        maxImages: options.maxImages,
        sentCount: images.length,
      }),
    );
  }

  const seen = new Set<string>();
  for (const image of images) {
    for (const key of [image?.cardKey, image?.detailKey]) {
      assertKeyShape(key);
      // Aynı anahtarın iki kez gönderilmesi, tek görselin iki satır olarak
      // yazılmasına ve galeride çift görünmesine yol açıyordu.
      if (seen.has(key as string)) {
        throw new BadRequestException(
          i18nMessage("server.product.duplicateImage"),
        );
      }
      seen.add(key as string);

      const isExisting = options.existingKeys?.has(key as string) ?? false;
      if (
        !isExisting &&
        !isOwnedProductImageKey(key as string, options.userId)
      ) {
        throw new BadRequestException(
          i18nMessage("server.product.imageNotOwned"),
        );
      }
    }
  }
}

function assertKeyShape(key: unknown): asserts key is string {
  if (typeof key !== "string" || !key.trim()) {
    throw new BadRequestException(i18nMessage("server.product.imageKeyEmpty"));
  }
  // Dizin atlama ve beklenmedik karakterler: anahtar doğrudan depolama yoluna
  // giriyor, serbest bırakılamaz.
  if (key.includes("..") || !SAFE_KEY.test(key)) {
    throw new BadRequestException(
      i18nMessage("server.product.imageKeyInvalid"),
    );
  }
  if (!key.includes(PRODUCT_IMAGE_PATH)) {
    throw new BadRequestException(
      i18nMessage("server.product.imageKeyWrongPath"),
    );
  }
}
