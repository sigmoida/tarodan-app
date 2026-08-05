interface ReferenceOption {
  id: string;
  name: string;
  slug: string;
}

interface SelectedReference {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
}

/**
 * Keep the saved reference visible while its catalog request is still loading,
 * and when an administrator has since made that reference inactive.
 */
export function withSelectedReference<T extends ReferenceOption>(
  options: T[],
  selected: SelectedReference,
): T[] {
  if (!selected.id || !selected.name) return options;
  if (options.some((option) => option.id === selected.id)) return options;

  return [
    {
      id: selected.id,
      name: selected.name,
      slug: selected.slug ?? "",
    } as T,
    ...options,
  ];
}
