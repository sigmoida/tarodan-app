import type {
  CatalogImportColumn,
  CatalogImportResource,
} from "@/lib/api/catalog-import.types";

/** i18n anahtarında kaynak adı camelCase: `car-models` → `carModels`. */
const KEY_SEGMENT: Record<CatalogImportResource, string> = {
  brands: "brands",
  manufacturers: "manufacturers",
  "car-models": "carModels",
};

type Translate = (key: string, values?: Record<string, unknown>) => string;

/**
 * Kolonun kullanıcıya gösterilen açıklaması.
 *
 * Kolon listesinin kendisi sunucudan gelir (tek kaynak); yalnızca insan
 * okuyacak metin i18n kataloğundan çözülür — ham Türkçe metin ESLint tarafından
 * yasak. Karşılığı olmayan bir anahtar için kolonun teknik adına düşer, böylece
 * API'ye yeni kolon eklenmesi dialogu kırmaz.
 */
export function importColumnLabel(
  t: Translate,
  resource: CatalogImportResource,
  column: CatalogImportColumn,
): string {
  const key = `admin.catalog.import.columns.${KEY_SEGMENT[resource]}.${column.key}`;
  try {
    const label = t(key);
    return label === key ? column.key : label;
  } catch {
    return column.key;
  }
}
