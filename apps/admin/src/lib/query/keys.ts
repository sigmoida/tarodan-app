/**
 * TanStack Query key conventions for admin resources.
 *
 * Every key starts with the resource name, so a mutation can invalidate ALL of
 * a resource's lists + details in one call:
 *   queryClient.invalidateQueries({ queryKey: [resource] })
 *
 *   list:   [resource, 'list', params]
 *   detail: [resource, 'detail', id]
 */
export const adminKeys = {
  all: (resource: string) => [resource] as const,
  list: (resource: string, params?: unknown) =>
    [resource, "list", params] as const,
  detail: (resource: string, id: string) => [resource, "detail", id] as const,
  // ── Auxiliary queries (options dropdowns, stat panels, row counts) ──
  // These sit alongside a resource's lists/details; routing them through the
  // registry stops the same array being hand-typed (and drifting) across files.
  // Each returns the exact array previously written inline, so invalidation is
  // unchanged. `count` is a separate top-level key (`<resource>-count`), not a
  // member of `[resource]`, matching how the count endpoints were keyed.
  options: (resource: string) => [resource, "options"] as const,
  stats: (resource: string) => [resource, "stats"] as const,
  preview: (resource: string, params?: unknown) =>
    [resource, "preview", params] as const,
  count: (resource: string, params?: unknown) =>
    [`${resource}-count`, params] as const,
};
