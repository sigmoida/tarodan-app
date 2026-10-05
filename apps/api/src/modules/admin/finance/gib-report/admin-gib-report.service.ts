import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Locale } from "@tarodan/i18n";
import {
  GIB_IDENTITY_KIND_I18N_KEYS,
  GIB_LISTING_STATUS_I18N_KEYS,
  GIB_NAME_SOURCE_I18N_KEYS,
  GIB_SELLER_KIND_I18N_KEYS,
  type AdminGibReportRow,
  type GibListingStatus,
} from "@tarodan/types";

import { PrismaService } from "../../../../prisma";
import { paginate, resolveOrderBy } from "../../../../common/list";
import {
  renderSheet,
  toXlsx,
  type ExportColumn,
} from "../../../../common/helpers/tabular-export";
import { frontendUrl } from "../../../../config/app-urls";
import { translateMessage } from "../../../i18n/translate";
import type { GibReportQueryDto } from "../../dto/gib-report.dto";
import {
  GIB_SELLER_SELECT,
  resolveGibSellerIdentity,
} from "./gib-seller-identity";
import { buildGibReportWhere } from "./gib-report.where";

/**
 * Tek istekte üretilecek döküm tavanı. Devlet dökümü eksik olmamalı, bu yüzden
 * onay kayıtlarının tavanından yüksektir; aşılırsa başlıkla bildirilir.
 */
export const GIB_REPORT_EXPORT_ROW_CAP = 20000;

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
  constructor(private readonly prisma: PrismaService) {}

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
   * Geçerli filtrenin Excel dökümü — listeyle AYNI filtre ve sıra. Tavan + 1
   * okunur: sessizce kırpılan bir döküm, devlet dosyasında fark edilmeyen
   * eksik kayıttır; aşım `truncated` ile bildirilir.
   */
  async exportXlsx(
    query: GibReportQueryDto,
    locale: Locale,
  ): Promise<{
    filename: string;
    body: Buffer;
    rowCount: number;
    truncated: boolean;
  }> {
    const found = await this.prisma.product.findMany({
      where: buildGibReportWhere(query),
      orderBy: this.orderBy(query),
      select: ROW_SELECT,
      take: GIB_REPORT_EXPORT_ROW_CAP + 1,
    });
    const truncated = found.length > GIB_REPORT_EXPORT_ROW_CAP;
    const rows = (
      truncated ? found.slice(0, GIB_REPORT_EXPORT_ROW_CAP) : found
    ).map(toGibRow);
    const t = (key: string) => translateMessage(key, locale);
    const day = new Date().toISOString().slice(0, 10);
    return {
      filename: `gib-ilan-satici-raporu-${day}.xlsx`,
      body: await toXlsx([
        renderSheet(
          t("admin.gibReport.export.sheetName"),
          exportColumns(t),
          rows,
        ),
      ]),
      rowCount: rows.length,
      truncated,
    };
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

const HEADER = "admin.gibReport.export";

/** Döküm kolonları — başlıklar panelin katalog anahtarlarından. TAM kimlik no. */
export function exportColumns(
  t: (key: string) => string,
): ExportColumn<AdminGibReportRow>[] {
  return [
    { header: t(`${HEADER}.membershipDate`), value: (r) => r.membershipDate },
    { header: t(`${HEADER}.identityNumber`), value: (r) => r.identityNumber },
    {
      header: t(`${HEADER}.identityKind`),
      value: (r) =>
        r.identityKind ? t(GIB_IDENTITY_KIND_I18N_KEYS[r.identityKind]) : "",
    },
    { header: t(`${HEADER}.legalName`), value: (r) => r.legalName },
    {
      header: t(`${HEADER}.legalNameSource`),
      value: (r) => t(GIB_NAME_SOURCE_I18N_KEYS[r.legalNameSource]),
    },
    {
      header: t(`${HEADER}.sellerKind`),
      value: (r) => t(GIB_SELLER_KIND_I18N_KEYS[r.sellerKind]),
    },
    {
      header: t(`${HEADER}.sellerDeleted`),
      value: (r) => t(r.sellerDeleted ? "common.yes" : "common.no"),
    },
    { header: t(`${HEADER}.productCode`), value: (r) => r.productCode },
    { header: t(`${HEADER}.title`), value: (r) => r.title },
    { header: t(`${HEADER}.description`), value: (r) => r.description },
    { header: t(`${HEADER}.price`), value: (r) => r.price },
    {
      header: t(`${HEADER}.status`),
      value: (r) => t(GIB_LISTING_STATUS_I18N_KEYS[r.status]),
    },
    { header: t(`${HEADER}.publishedAt`), value: (r) => r.publishedAt },
    { header: t(`${HEADER}.createdAt`), value: (r) => r.createdAt },
    { header: t(`${HEADER}.listingUrl`), value: (r) => r.listingUrl },
    { header: t(`${HEADER}.storeName`), value: (r) => r.storeName },
    { header: t(`${HEADER}.profileUrl`), value: (r) => r.profileUrl },
  ];
}
