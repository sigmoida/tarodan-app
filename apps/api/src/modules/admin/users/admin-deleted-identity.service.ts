import { Injectable } from "@nestjs/common";
import { Prisma, type DeletedUserIdentity } from "@prisma/client";
import { EXPORT_CATALOGS, type ExportCatalogKey } from "@tarodan/types";

import { PrismaService } from "../../../prisma";
import {
  buildSearchWhere,
  dateRangeWhere,
  paginate,
  resolveOrderBy,
} from "../../../common/list";
import { archiveLegalFullName } from "../../../common/helpers/deleted-user-identity";
import { istanbulMonthRange } from "../../../common/helpers/tr-calendar";
import {
  ExportListService,
  type ExportFile,
  type ExportRecord,
  type Translate,
  type WorkbookSummaryRow,
} from "../../../common/export";
import type {
  DeletedUserIdentityExportQueryDto,
  DeletedUserIdentityQueryDto,
} from "../dto/deleted-user-identity.dto";

/** Kimlik bir kez yazılıp bir daha değişmediği için arama alanları sabittir. */
const SEARCH_FIELDS = [
  "email",
  "username",
  "displayName",
  "legalFirstName",
  "legalLastName",
  "phone",
  "nationalId",
  "taxId",
  "companyName",
  "adminCode",
] as const;

/**
 * Aylık bildirim dosyasının biçim sürümü — müşteri dosyayı resmî bir portala
 * yüklüyor; kolon kümesi ya da sayfa düzeni değişince artırılır ve Bilgi
 * sayfasında görünür. 2: ilk sayfa Özet, tarihler İstanbul takviminde.
 */
export const EXPORT_FORMAT_VERSION = "2";

/** Stopaj/fatura gibi geçmiş raporların silinen kullanıcı için okuduğu alanlar. */
export interface ArchivedIdentity {
  displayName: string | null;
  companyName: string | null;
  taxId: string | null;
  nationalId: string | null;
  email: string | null;
}

/**
 * Silinen hesapların kimlik arşivi — okuma tarafı.
 *
 * Arşiv yalnız SİLME yolunda yazılır (`UserProfileService.deleteAccount`) ve DB
 * tetikleyicisiyle silinemez; burada yazma metodu bilinçli olarak YOKTUR.
 */
@Injectable()
export class AdminDeletedIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exports: ExportListService,
  ) {}

  async list(query: DeletedUserIdentityQueryDto) {
    const where: Prisma.DeletedUserIdentityWhereInput = {
      ...(buildSearchWhere(query.search, SEARCH_FIELDS) ?? {}),
      // Dönem filtresi silme tarihine bağlanır; arşiv satırının createdAt'i
      // backfill'de toplu olarak bugüne düşer ve dönem raporunu bozardı.
      ...dateRangeWhere(query, "deletedAt"),
    };

    if (query.source) where.source = query.source;
    if (query.wasSeller !== undefined) where.wasSeller = query.wasSeller;
    // Üç durumlu: filtre verilmezse hepsi; "evet" süresi dolanlar; "hayır"
    // süresi dolmayanlar. Seçim yapıp hiçbir şeyin değişmemesi sessiz bir
    // yanlış okuma olurdu.
    if (query.retentionExpired !== undefined) {
      const now = new Date();
      where.retainUntil = query.retentionExpired ? { lt: now } : { gte: now };
    }

    const orderBy =
      resolveOrderBy<Prisma.DeletedUserIdentityOrderByWithRelationInput>(
        "DeletedUserIdentity",
        query,
        { defaultSort: { deletedAt: "desc" } },
      );

    return paginate(this.prisma.deletedUserIdentity, { where, orderBy }, query);
  }

  /**
   * Aylık bildirim dosyası (XLSX). Dönem zorunlu ve `deletedAt` üzerinden; ay
   * sınırları TÜRKİYE takviminde (ayın son gecesi 21:00'den sonra silinen hesap
   * artık sonraki aya düşmez). Kolon sözleşmesi `EXPORT_CATALOGS.deletedIdentities`
   * ile tek yerde — portal sırayı bekler. Başlıklar her zaman Türkçe (resmî
   * biçim), kimlik/IBAN maskesiz: uç yalnız super_admin/admin'e açık.
   */
  async exportPeriod(
    query: DeletedUserIdentityExportQueryDto,
    actorId: string,
  ): Promise<ExportFile> {
    const { gte, lt } = istanbulMonthRange(query.year, query.month);
    const where: Prisma.DeletedUserIdentityWhereInput = {
      deletedAt: { gte, lt },
    };
    if (query.wasSeller !== undefined) where.wasSeller = query.wasSeller;

    const period = `${query.year}-${String(query.month).padStart(2, "0")}`;
    return this.exports.exportList({
      catalog: EXPORT_CATALOGS.deletedIdentities,
      locale: "tr",
      slug: `tarodan-silinen-hesap-bildirimi-${period}`,
      titleKey: "admin.deletedIdentities.export.title",
      titleValues: { period },
      sheetNameKey: "admin.deletedIdentities.export.sheetName",
      unmask: true,
      filters: [
        { labelKey: "admin.deletedIdentities.export.period", value: period },
        {
          labelKey: "admin.deletedIdentities.filterWasSeller",
          value: query.wasSeller,
        },
      ],
      fetchPage: ({ skip, take }) =>
        this.prisma.deletedUserIdentity.findMany({
          where,
          orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
          skip,
          take,
        }),
      map: deletedIdentityExportRecord,
      // Kolon kümesi ileride değişirse yükleyen taraf bunu görebilsin.
      appendix: (t, result) => [
        {
          name: t("admin.deletedIdentities.export.infoSheet"),
          rows: deletedIdentityInfoRows(t, period, result),
        },
      ],
      audit: {
        actorId,
        action: "deleted_identity_export",
        entityType: "DeletedUserIdentity",
        entityId: period,
        query,
      },
    });
  }

  /**
   * Geçmiş raporların (stopaj, fatura) silinen kullanıcı için kimliği
   * arşivden çözmesi. Rapor kodu canlı `users` satırını okuduğunda geçmiş
   * dönemler geriye dönük "Silinmiş Kullanıcı" / VKN'siz görünüyordu.
   */
  async resolveArchivedIdentities(
    userIds: string[],
  ): Promise<Map<string, ArchivedIdentity>> {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) return new Map();

    const rows = await this.prisma.deletedUserIdentity.findMany({
      where: { userId: { in: unique } },
      select: {
        userId: true,
        displayName: true,
        companyName: true,
        taxId: true,
        nationalId: true,
        email: true,
      },
    });

    return new Map(rows.map(({ userId, ...identity }) => [userId, identity]));
  }
}

/** Bildirim satırı — yasal ad önce (kimlik kapısı), yoksa silme anındaki ad. */
export function deletedIdentityExportRecord(
  row: DeletedUserIdentity,
): ExportRecord<ExportCatalogKey<typeof EXPORT_CATALOGS.deletedIdentities>> {
  return {
    adminCode: row.adminCode,
    username: row.username,
    displayName: archiveLegalFullName(row),
    email: row.email,
    phone: row.phone,
    nationalId: row.nationalId,
    taxId: row.taxId,
    taxOffice: row.taxOffice,
    companyName: row.companyName,
    addressCity: row.addressCity,
    addressDistrict: row.addressDistrict,
    addressLine: row.addressLine,
    iban: row.iban,
    wasSeller: row.wasSeller,
    registeredAt: row.registeredAt,
    deletedAt: row.deletedAt,
    retainUntil: row.retainUntil,
  };
}

/** Bilgi sayfası: dönem, kayıt sayısı, biçim sürümü, oluşturulma, kırpılma. */
export function deletedIdentityInfoRows(
  t: Translate,
  period: string,
  result: { rowCount: number; truncatedAt: number | null; generatedAt: Date },
): WorkbookSummaryRow[] {
  return [
    { label: t("admin.deletedIdentities.export.period"), value: period },
    {
      label: t("server.export.summary.rowCount"),
      value: result.rowCount,
      type: "number",
    },
    {
      label: t("admin.deletedIdentities.export.formatVersion"),
      value: EXPORT_FORMAT_VERSION,
    },
    {
      label: t("server.export.summary.generatedAt"),
      value: result.generatedAt,
      type: "datetime",
    },
    ...(result.truncatedAt !== null
      ? [
          {
            label: t("server.export.summary.notes"),
            value: t("server.export.summary.truncated", {
              count: result.truncatedAt,
            }),
          },
        ]
      : []),
  ];
}
