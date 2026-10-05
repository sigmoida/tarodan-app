import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../../prisma";

/**
 * Moderasyona konu içeriğin parmak izi — "ilan son onaydan beri değişti mi?"
 * sorusunun TEK cevap yeri (bkz. şemada `approvedContentFingerprint`).
 *
 * Kapsam: moderatörün/AI'ın gördüğü ve satıcının değiştirebildiği içerik —
 * başlık, açıklama, sınıflandırma (kategori/marka/model/üretici/model kodu),
 * durum (condition) ve görseller (sırasıyla). Fiyat, stok, indirim ve nitelik
 * seçimleri BİLEREK dışarıdadır: onaylı ilanda serbestçe değişir (fiyat limiti
 * ve komisyon kuralı her yazımda ayrıca denetlenir), moderasyon kuyruğuna konu
 * değildir.
 */
export interface ProductFingerprintInput {
  title: string;
  description?: string | null;
  categoryId: string;
  brandId?: string | null;
  carModelId?: string | null;
  manufacturerId?: string | null;
  modelCode?: string | null;
  condition?: string | null;
  images?: ReadonlyArray<{
    cardKey: string;
    detailKey: string;
    sortOrder?: number | null;
  }> | null;
}

/** Parmak izi için okunacak alanlar — hesap ile okuma aynı yerde kalsın. */
export const PRODUCT_FINGERPRINT_SELECT = {
  title: true,
  description: true,
  categoryId: true,
  brandId: true,
  carModelId: true,
  manufacturerId: true,
  modelCode: true,
  condition: true,
  images: {
    select: { cardKey: true, detailKey: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  },
} as const satisfies Prisma.ProductSelect;

/** Kararlı (alan sırasından bağımsız) SHA-256 özeti. */
export function computeProductContentFingerprint(
  input: ProductFingerprintInput,
): string {
  const images = [...(input.images ?? [])]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((image) => [image.cardKey, image.detailKey]);
  const canonical = JSON.stringify([
    input.title,
    input.description ?? null,
    input.categoryId,
    input.brandId ?? null,
    input.carModelId ?? null,
    input.manufacturerId ?? null,
    input.modelCode ?? null,
    input.condition ?? null,
    images,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

type FingerprintDb = Pick<PrismaService, "product">;

/** İlanın GÜNCEL içeriğinin parmak izi (ilan yoksa null). */
export async function loadProductContentFingerprint(
  db: FingerprintDb,
  productId: string,
): Promise<string | null> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: PRODUCT_FINGERPRINT_SELECT,
  });
  return product ? computeProductContentFingerprint(product) : null;
}

/**
 * Onay yazımından SONRA çağrılır: güncel içeriği "onaylı içerik" olarak damgalar.
 * Hata onayı bozmaz — damga yazılamazsa iz eksik kalır ve yenileme güvenli
 * tarafa (normal onay) düşer; bu yüzden hata yutulur ve `false` döner.
 */
export async function stampApprovedContentFingerprint(
  db: FingerprintDb,
  productId: string,
): Promise<boolean> {
  try {
    const fingerprint = await loadProductContentFingerprint(db, productId);
    if (!fingerprint) return false;
    await db.product.update({
      where: { id: productId },
      data: { approvedContentFingerprint: fingerprint },
    });
    return true;
  } catch {
    return false;
  }
}
