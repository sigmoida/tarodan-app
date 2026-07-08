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
  list: (resource: string, params?: unknown) => [resource, 'list', params] as const,
  detail: (resource: string, id: string) => [resource, 'detail', id] as const,
};
