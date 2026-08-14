/**
 * Katalog toplu içe aktarma API sözleşmesi.
 *
 * Kolon listesi ve limitler burada SABİTLENMEZ — sunucudan `import-schema`
 * ile çekilir. Tek kaynak API'deki tanımdır; kolon eklendiğinde dialogtaki
 * "örnek dosya yapısı" tablosu ve şablon kendiliğinden takip eder.
 */

export type CatalogImportResource = "brands" | "manufacturers" | "car-models";

export type CatalogImportColumnType = "text" | "number" | "boolean";

export interface CatalogImportColumn {
  key: string;
  required: boolean;
  type: CatalogImportColumnType;
  example: string | number | boolean | null;
  maxLength?: number;
  min?: number;
  max?: number;
}

export interface CatalogImportSchema {
  resource: CatalogImportResource;
  sheetName: string;
  columns: CatalogImportColumn[];
  limits: { maxRows: number; maxFileBytes: number };
}

export interface CatalogImportResult {
  resource: CatalogImportResource;
  createdCount: number;
  names: string[];
}
