export const PAGE_SIZE_OPTIONS = [20, 50, 100, 250] as const;

export function normalizePageSize(value: number, fallback: number): number {
  return PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number])
    ? value
    : fallback;
}
