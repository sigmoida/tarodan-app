export interface TemplateListItem {
  key: string;
  name: string;
  group: string;
  subject: string | null;
  hasCustomBody: boolean;
  variablesJson: string | null;
  updatedAt: string | null;
}

export interface TemplateDetail {
  key: string;
  name: string;
  subject: string | null;
  bodyHtml: string | null;
  variablesJson: string | null;
  isCustom: boolean;
}

/** Convert sample data into source data with `{{variable}}` placeholders for the editor. */
export function makeSourceData(
  sample: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sample)) {
    if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (item !== null && typeof item === 'object') {
          const o: Record<string, unknown> = {};
          for (const k of Object.keys(item as object)) {
            const v = (item as Record<string, unknown>)[k];
            o[k] = typeof v === 'number' ? v : `{{${k}}}`;
          }
          return o;
        }
        return `{{${key}}}`;
      });
    } else if (typeof value === 'number') {
      result[key] = value;
    } else {
      result[key] = `{{${key}}}`;
    }
  }
  return result;
}
