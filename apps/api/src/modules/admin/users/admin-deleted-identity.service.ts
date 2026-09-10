import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma";
import {
  buildSearchWhere,
  dateRangeWhere,
  paginate,
  resolveOrderBy,
} from "../../../common/list";
import {
  ARCHIVE_EXPORT_COLUMNS,
  EXPORT_FORMAT_VERSION,
} from "../../../common/helpers/deleted-user-identity";
import type {
  DeletedUserIdentityExportQueryDto,
  DeletedUserIdentityQueryDto,
} from "../dto/deleted-user-identity.dto";

/** Kimlik bir kez yazılıp bir daha değişmediği için arama alanları sabittir. */
const SEARCH_FIELDS = [
  "email",
  "username",
  "displayName",
  "phone",
  "nationalId",
  "taxId",
  "companyName",
  "adminCode",
] as const;

/** Aylık bildirimde tek istekte üretilecek makul üst sınır. */
const EXPORT_ROW_CAP = 5000;

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
  constructor(private readonly prisma: PrismaService) {}

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
   * Aylık bildirim dosyası (XLSX). Dönem zorunlu ve `deletedAt` üzerinden.
   * Kolon sözleşmesi `ARCHIVE_EXPORT_COLUMNS` ile tek yerde tanımlı — müşteri
   * bu dosyayı resmî bir portala yüklüyor, sıra sessizce değişmemeli.
   */
  async exportPeriod(query: DeletedUserIdentityExportQueryDto): Promise<{
    buffer: Buffer;
    filename: string;
    rowCount: number;
    /** Dönem tavanı aştı: dosya eksik — denetim kaydına da düşer. */
    truncated: boolean;
    period: string;
  }> {
    const from = new Date(Date.UTC(query.year, query.month - 1, 1));
    const to = new Date(Date.UTC(query.year, query.month, 1));

    const where: Prisma.DeletedUserIdentityWhereInput = {
      deletedAt: { gte: from, lt: to },
    };
    if (query.wasSeller !== undefined) where.wasSeller = query.wasSeller;

    // Tavan + 1 çekilir: dosyanın SESSİZCE kırpılması, resmî bir bildirimde
    // fark edilmeden eksik beyana dönüşürdü. Aşım Bilgi sayfasına yazılır.
    const found = await this.prisma.deletedUserIdentity.findMany({
      where,
      orderBy: { deletedAt: "asc" },
      take: EXPORT_ROW_CAP + 1,
    });
    const truncated = found.length > EXPORT_ROW_CAP;
    const rows = truncated ? found.slice(0, EXPORT_ROW_CAP) : found;

    const period = `${query.year}-${String(query.month).padStart(2, "0")}`;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Tarodan";
    workbook.company = "Tarodan";
    workbook.title = `Silinen Hesap Kimlik Bildirimi ${period}`;

    const sheet = workbook.addWorksheet(`Bildirim ${period}`, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = ARCHIVE_EXPORT_COLUMNS.map((column) => ({
      header: column.header,
      key: column.key,
      width: 22,
    }));
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
      sheet.addRow({
        adminCode: row.adminCode ?? "",
        username: row.username,
        displayName: row.displayName ?? "",
        email: row.email ?? "",
        phone: row.phone ?? "",
        nationalId: row.nationalId ?? "",
        taxId: row.taxId ?? "",
        taxOffice: row.taxOffice ?? "",
        companyName: row.companyName ?? "",
        addressCity: row.addressCity ?? "",
        addressDistrict: row.addressDistrict ?? "",
        addressLine: row.addressLine ?? "",
        iban: row.iban ?? "",
        wasSeller: row.wasSeller ? "Evet" : "Hayır",
        registeredAt: row.registeredAt,
        deletedAt: row.deletedAt,
        retainUntil: row.retainUntil,
      });
    }

    // Kolon kümesi ileride değişirse yükleyen taraf bunu görebilsin.
    const meta = workbook.addWorksheet("Bilgi");
    meta.addRow(["Dönem", period]);
    meta.addRow(["Kayıt sayısı", rows.length]);
    meta.addRow(["Biçim sürümü", EXPORT_FORMAT_VERSION]);
    meta.addRow(["Oluşturulma", new Date()]);
    if (truncated) {
      meta.addRow([
        "UYARI",
        `Dönemde ${EXPORT_ROW_CAP}'den fazla kayıt var; dosya ilk ${EXPORT_ROW_CAP} kaydı içeriyor.`,
      ]);
    }

    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: `tarodan-silinen-hesap-bildirimi-${period}.xlsx`,
      rowCount: rows.length,
      truncated,
      period,
    };
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
