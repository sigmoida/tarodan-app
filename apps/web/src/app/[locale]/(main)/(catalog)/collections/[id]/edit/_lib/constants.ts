export function flattenCategories(
  tree: { id: string; name: string; slug: string; children?: any[] }[],
  prefix = "",
): { id: string; name: string; slug: string }[] {
  const out: { id: string; name: string; slug: string }[] = [];
  for (const c of tree) {
    out.push({
      id: c.id,
      name: prefix ? `${prefix} ${c.name}` : c.name,
      slug: c.slug,
    });
    if (c.children?.length) {
      out.push(...flattenCategories(c.children, "—"));
    }
  }
  return out;
}

// UUID format checker
export const isUUID = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
