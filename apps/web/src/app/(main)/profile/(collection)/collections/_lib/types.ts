/** @format */

export interface Collection {
	id: string;
	name: string;
	description?: string;
	coverImageUrl?: string;
	isPublic: boolean;
	itemCount: number;
	createdAt: string;
	viewCount?: number;
	likeCount?: number;
	userName?: string;
}

export type SortOption = 'popular' | 'recent' | 'name' | 'items_asc' | 'items_desc';

export interface FlatCategory {
	id: string;
	name: string;
	slug: string;
}

/** Flatten the category tree into a prefixed, selectable list. */
export function flattenCategories(
	tree: { id: string; name: string; slug: string; children?: any[] }[],
	prefix = '',
): FlatCategory[] {
	const out: FlatCategory[] = [];
	for (const c of tree) {
		out.push({ id: c.id, name: prefix ? `${prefix} ${c.name}` : c.name, slug: c.slug });
		if (c.children?.length) {
			out.push(...flattenCategories(c.children, '—'));
		}
	}
	return out;
}
