import { Prisma, type FiscalInvoiceType } from "@prisma/client";

/**
 * Admin fatura ekranının sekmeleri. Ayrık kümeler DEĞİL, birer görünümdür: bir
 * ceza faturası hem "Ceza Faturaları" sekmesinde hem de kesildiği tarafın
 * sekmesinde görünür.
 *
 * "Kurumsal Cari Faturaları" burada yoktur — o sekme kurumsal satıcıların elle
 * yüklediği ÜRÜN faturalarını (`SellerUploadedInvoice`) listeler ve kendi
 * ucundan beslenir.
 */
export const FISCAL_INVOICE_SCOPES = [
  "all",
  "buyer",
  "seller",
  "penalty",
  "platform",
] as const;

export type FiscalInvoiceScope = (typeof FISCAL_INVOICE_SCOPES)[number];

/**
 * Tarodan'ın KENDİ satışları: muhatabı işlemin alıcısıdır ama bunlar bir
 * alışverişin tarafına kesilmiş belgeler değildir, kendi sekmelerinde dururlar.
 */
const PLATFORM_SALE_TYPES: FiscalInvoiceType[] = ["membership", "boost"];

/** Taraf sekmelerinin ihtiyaç duyduğu alan referansları (`prisma.fiscalInvoice.fields`). */
export type InvoicePartyFieldRefs = Pick<
  Prisma.FiscalInvoiceFieldRefs,
  "sellerUserId" | "buyerUserId"
>;

/**
 * Sekmenin `where` parçası.
 *
 * Taraf sekmeleri belgenin MUHATABINI işlemin taraflarıyla karşılaştırır —
 * türden çıkarım yapmaz. Tek kural her belgeyi doğru yere koyar: takas belgesi
 * ödeyen tarafa kesilir (alıcı), ceza kusurlu tarafa, iade faturası ise ters
 * çevirdiği belgenin tarafına. Tarafları çözülememiş eski kayıtlar taraf
 * sekmelerine düşmez ama "Tüm Faturalar"da durur.
 */
export function fiscalInvoiceScopeWhere(
  scope: FiscalInvoiceScope | undefined,
  fields: InvoicePartyFieldRefs,
): Prisma.FiscalInvoiceWhereInput {
  switch (scope) {
    case "seller":
      return { recipientUserId: { equals: fields.sellerUserId } };
    case "buyer":
      return {
        recipientUserId: { equals: fields.buyerUserId },
        type: { notIn: PLATFORM_SALE_TYPES },
      };
    case "penalty":
      return { type: "penalty" };
    case "platform":
      return { type: { in: PLATFORM_SALE_TYPES } };
    default:
      return {};
  }
}
