import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Locale } from "@tarodan/i18n";
import {
  GIB_IDENTITY_KIND_I18N_KEYS,
  GIB_LISTING_STATUS_I18N_KEYS,
  GIB_NAME_SOURCE_I18N_KEYS,
  GIB_SELLER_KIND_I18N_KEYS,
  EXPORT_CATALOGS,
  type AdminGibReportRow,
  type ExportCatalogKey,
  type GibListingStatus,
} from "@tarodan/types";

import { PrismaService } from "../../../../prisma";
import { paginate, resolveOrderBy } from "../../../../common/list";
import {
  ExportListService,
  type ExportFile,
  type ExportRecord,
  type Translate,
} from "../../../../common/export";
import { frontendUrl } from "../../../../config/app-urls";
import type { GibReportQueryDto } from "../../dto/gib-report.dto";
import {
  GIB_SELLER_SELECT,
  resolveGibSellerIdentity,
} from "./gib-seller-identity";
import { buildGibReportWhere } from "./gib-report.where";

const ROW_SELECT = {
  id: true,
  productCode: true,
  title: true,
  description: true,
  price: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  seller: { select: GIB_SELLER_SELECT },
} satisfies Prisma.ProductSelect;

type GibProduct = Prisma.ProductGetPayload<{ select: typeof ROW_SELECT }>;

/**
 * GİB ilan / satıcı raporu — admin okuma modeli (liste + Excel dökümü).
 *
 * Yazım YOKTUR. Satır = ilan, İLANIN BUGÜNKÜ hâli: düzenlemeler üzerine
 * yazıldığı ve ilan geçmişi tutulmadığı için geçmişe dönük bir görünüm yoktur
 * (bkz. docs/GIB_REPORT.md).
 */
@Injectable()
export class AdminGibReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exports: ExportListService,
  ) {}

  async list(query: GibReportQueryDto) {
    const result = await paginate(
      this.prisma.product,
      {
        where: buildGibReportWhere(query),
        orderBy: this.orderBy(query),
        select: ROW_SELECT,
      },
      query,
    );
    return { ...result, data: result.data.map(toGibRow) };
  }

  /**
   * Geçerli filtrenin Excel dökümü — listeyle AYNI filtre ve sıra; tavan,
   * kırpılma, Özet ve zorunlu denetim ortak hatta. Kimlik numarası TAM yazılır:
   * uç `@Roles(super_admin, admin)` + `tax` izniyle kapalı, maskesiz görme
   * hakkı ucun kendisidir. Arama terimi (vergi no / TCKN olabilir) denetime de
   * Özet'e de yazılmaz.
   */
  async export(
    query: GibReportQueryDto,
    actorId: string,
    locale: Locale,
  ): Promise<ExportFile> {
    const where = buildGibReportWhere(query);
    const orderBy = this.orderBy(query);
    return this.exports.exportList({
      catalog: EXPORT_CATALOGS.gibReport,
      locale,
      slug: "gib-ilan-satici-raporu",
      titleKey: "admin.gibReport.title",
      sheetNameKey: "admin.gibReport.export.sheetName",
      unmask: true,
      filters: [
        {
          labelKey: "admin.gibReport.filters.status",
          value: query.status,
          valueKey: query.status && GIB_LISTING_STATUS_I18N_KEYS[query.status],
        },
        {
          labelKey: "admin.gibReport.filters.sellerKind",
          value: query.sellerKind,
          valueKey:
            query.sellerKind && GIB_SELLER_KIND_I18N_KEYS[query.sellerKind],
        },
        {
          labelKey: "admin.gibReport.filters.identityIncomplete",
          value: query.identityIncomplete ? true : undefined,
          valueKey: "admin.gibReport.filters.identityIncompleteOnly",
        },
        { labelKey: "admin.finance.common.startDate", value: query.startDate },
        { labelKey: "admin.finance.common.endDate", value: query.endDate },
      ],
      sort: query,
      fetchPage: async ({ skip, take }) =>
        (
          await this.prisma.product.findMany({
            where,
            orderBy,
            select: ROW_SELECT,
            skip,
            take,
          })
        ).map(toGibRow),
      map: gibExportRecord,
      audit: {
        actorId,
        action: "gib_report_export",
        entityType: "GibReport",
        query,
      },
    });
  }

  /**
   * Varsayılan sıra: son yayın (yeni → eski). Aynı değerli satırlarda sayfa
   * sınırı kaymasın diye `id` ikinci anahtardır.
   */
  private orderBy(
    query: GibReportQueryDto,
  ): Prisma.ProductOrderByWithRelationInput[] {
    return [
      resolveOrderBy<Prisma.ProductOrderByWithRelationInput>("Product", query, {
        defaultSort: { publishedAt: { sort: "desc", nulls: "last" } },
      }),
      { id: "asc" },
    ];
  }
}

/** Ürün satırı → rapor satırı; satıcı kuralları `resolveGibSellerIdentity`de. */
export function toGibRow(product: GibProduct): AdminGibReportRow {
  const base = frontendUrl();
  const seller = resolveGibSellerIdentity(product.seller);
  return {
    productId: product.id,
    productCode: product.productCode,
    title: product.title,
    description: product.description,
    price: Number(product.price),
    status: product.status as GibListingStatus,
    publishedAt: product.publishedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    // Kanonik herkese açık ilan yolu `/listings/:id` (`/products/:id` yok).
    listingUrl: `${base}/listings/${encodeURIComponent(product.id)}`,
    sellerId: product.seller.id,
    sellerKind: seller.sellerKind,
    sellerDeleted: seller.sellerDeleted,
    membershipDate: seller.membershipDate.toISOString(),
    identityNumber: seller.identityNumber,
    identityKind: seller.identityKind,
    legalName: seller.legalName,
    legalNameSource: seller.legalNameSource,
    storeName: seller.storeName,
    // Kanonik herkese açık profil yolu `/u/:kullanıcıAdı` (id'ye düşebilir).
    profileUrl: seller.profileHandle
      ? `${base}/u/${encodeURIComponent(seller.profileHandle)}`
      : null,
  };
}

/** Döküm satırı — kolonlar `EXPORT_CATALOGS.gibReport`. TAM kimlik no. */
export function gibExportRecord(
  r: AdminGibReportRow,
  t: Translate,
): ExportRecord<ExportCatalogKey<typeof EXPORT_CATALOGS.gibReport>> {
  return {
    membershipDate: r.membershipDate,
    identityNumber: r.identityNumber,
    identityKind: r.identityKind
      ? t(GIB_IDENTITY_KIND_I18N_KEYS[r.identityKind])
      : null,
    legalName: r.legalName,
    legalNameSource: t(GIB_NAME_SOURCE_I18N_KEYS[r.legalNameSource]),
    sellerKind: t(GIB_SELLER_KIND_I18N_KEYS[r.sellerKind]),
    sellerDeleted: r.sellerDeleted,
    productCode: r.productCode,
    title: r.title,
    description: r.description,
    price: r.price,
    status: t(GIB_LISTING_STATUS_I18N_KEYS[r.status]),
    publishedAt: r.publishedAt,
    createdAt: r.createdAt,
    listingUrl: r.listingUrl,
    storeName: r.storeName,
    profileUrl: r.profileUrl,
  };
}
