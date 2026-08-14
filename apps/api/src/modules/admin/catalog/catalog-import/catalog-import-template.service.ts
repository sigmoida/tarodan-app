import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { CATALOG_IMPORT_SPECS } from "./catalog-import.specs";
import {
  CATALOG_IMPORT_LIMITS,
  type CatalogImportResource,
  type CatalogImportSpec,
} from "./catalog-import.types";

/**
 * İndirilebilir Excel şablonunu, ayrıştırıcının kullandığı kolon tanımından
 * ÜRETİR. Şablonu build-time bir script'e yazmak (ürün akışındaki gibi) burada
 * yanlış olurdu: `.mjs` script'i `.ts` tanımını okuyamaz, kolon listesi ikinci
 * kez elle yazılır ve şablon ile ayrıştırıcı sessizce ayrışırdı.
 *
 * Çıktı satır sayısı sabit ve küçük olduğu için ilk üretimden sonra
 * `Buffer` önbelleğe alınır.
 */
@Injectable()
export class CatalogImportTemplateService {
  private readonly cache = new Map<CatalogImportResource, Buffer>();

  filename(resource: CatalogImportResource): string {
    return `tarodan-${resource}-sablonu.xlsx`;
  }

  async build(resource: CatalogImportResource): Promise<Buffer> {
    const cached = this.cache.get(resource);
    if (cached) return cached;

    const spec = CATALOG_IMPORT_SPECS[resource];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Tarodan";
    workbook.company = "Tarodan";
    workbook.title = `Tarodan ${spec.sheetName} Şablonu`;

    this.addDataSheet(workbook, spec);
    this.addGuideSheet(workbook, spec);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    this.cache.set(resource, buffer);
    return buffer;
  }

  private addDataSheet(
    workbook: ExcelJS.Workbook,
    spec: CatalogImportSpec,
  ): void {
    const sheet = workbook.addWorksheet(spec.sheetName, {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = spec.columns.map((column) => ({
      header: column.key,
      key: column.key,
      width: Math.max(14, Math.min(40, column.key.length + 8)),
    }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    spec.columns.forEach((column, index) => {
      // Zorunlu sütunlar ilk bakışta ayırt edilebilsin.
      headerRow.getCell(index + 1).note = column.required
        ? "Zorunlu alan"
        : "İsteğe bağlı alan";
    });
    headerRow.commit();

    sheet.addRow(
      Object.fromEntries(
        spec.columns.map((column) => [column.key, column.example]),
      ),
    );
  }

  /** Kolonların anlamını dosyanın içinde taşır — kullanıcı ekrana dönmek zorunda kalmasın. */
  private addGuideSheet(
    workbook: ExcelJS.Workbook,
    spec: CatalogImportSpec,
  ): void {
    const sheet = workbook.addWorksheet("Aciklama");
    sheet.columns = [
      { header: "Sütun", key: "key", width: 22 },
      { header: "Zorunlu", key: "required", width: 12 },
      { header: "Tür", key: "type", width: 14 },
      { header: "Kural", key: "rule", width: 46 },
      { header: "Örnek", key: "example", width: 32 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const column of spec.columns) {
      sheet.addRow({
        key: column.key,
        required: column.required ? "Evet" : "Hayır",
        type: this.typeLabel(column.type),
        rule: this.ruleLabel(column),
        example: column.example ?? "",
      });
    }

    sheet.addRow({});
    sheet.addRow({
      key: "Satır sınırı",
      rule: `Tek dosyada en fazla ${CATALOG_IMPORT_LIMITS.maxRows} satır`,
    });
    sheet.addRow({
      key: "Hata durumu",
      rule: "Tek satır bile hatalıysa hiçbir kayıt oluşturulmaz",
    });
  }

  private typeLabel(
    type: CatalogImportSpec["columns"][number]["type"],
  ): string {
    if (type === "number") return "Sayı";
    if (type === "boolean") return "Evet / Hayır";
    return "Metin";
  }

  private ruleLabel(column: CatalogImportSpec["columns"][number]): string {
    const rules: string[] = [];
    if (column.maxLength) rules.push(`En fazla ${column.maxLength} karakter`);
    if (column.min != null) rules.push(`En az ${column.min}`);
    if (column.max != null) rules.push(`En fazla ${column.max}`);
    if (column.type === "boolean") rules.push("Boş bırakılırsa Evet sayılır");
    return rules.join(" · ");
  }
}
