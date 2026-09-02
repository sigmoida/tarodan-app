import {
  NON_CUSTOM_GROUP_SLUGS,
  isGlobalCustomAttributeGroup,
} from "../../../common/helpers/attribute-groups";
import type { PrismaService } from "../../../prisma";

/**
 * `attributes[]` ile çözülen bir katalog satırı — kurallar yalnız grup
 * kimliğine ve kapsamına bakar, DI gerektirmez.
 */
export interface ResolvedAttributeRow {
  id: string;
  slug: string;
  group: {
    id: string;
    slug: string;
    name: string;
    manufacturerSlug: string | null;
  };
}

/**
 * Aynı genel özel grupta birden fazla FARKLI attribute seçilmiş grupların
 * adları (giriş sırasıyla).
 *
 * Genel özel gruplar tek seçimlidir; üreticiye bağlı gruplar ve renk çoklu
 * kalır. Aynı attribute'un iki kez gelmesi ihlal değildir — satırlar önce
 * `id` ile tekilleştirilir. Attribute slug'ı yalnız grup içinde tekil olduğu
 * için sayım `group.id` üzerinden yapılır.
 */
export function findMultiSelectedGlobalCustomGroups(
  rows: ResolvedAttributeRow[],
): string[] {
  const seenAttribute = new Set<string>();
  const countByGroup = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    if (seenAttribute.has(row.id)) continue;
    seenAttribute.add(row.id);
    if (!isGlobalCustomAttributeGroup(row.group)) continue;
    const entry = countByGroup.get(row.group.id) ?? {
      name: row.group.name,
      count: 0,
    };
    entry.count += 1;
    countByGroup.set(row.group.id, entry);
  }
  return [...countByGroup.values()]
    .filter((entry) => entry.count > 1)
    .map((entry) => entry.name);
}

/**
 * Seçimde hiç temsil edilmeyen zorunlu grupların adları (`required` sırası
 * korunur). Çağıran, `required` listesini yalnız genel özel gruplardan
 * kurar; ölçek/malzeme/renk kendi yollarında zaten zorunludur.
 */
export function findMissingRequiredGroups(
  required: Array<{ slug: string; name: string }>,
  rows: ResolvedAttributeRow[],
): string[] {
  const present = new Set(rows.map((row) => row.group.slug));
  return required
    .filter((group) => !present.has(group.slug))
    .map((group) => group.name);
}

/**
 * Zorunlu genel özel gruplar: aktif, `isRequired`, üreticisiz, sabit üçlü ve
 * gizli dışı, en az bir aktif değeri olan. Değeri olmayan zorunlu grup
 * sayılmaz — admin değer girmeden "zorunlu" işaretlerse ilan verme tıkanmasın.
 */
export function loadRequiredGlobalCustomGroups(
  prisma: Pick<PrismaService, "attributeGroup">,
): Promise<Array<{ slug: string; name: string }>> {
  return prisma.attributeGroup.findMany({
    where: {
      isActive: true,
      isRequired: true,
      manufacturerSlug: null,
      slug: { notIn: [...NON_CUSTOM_GROUP_SLUGS] },
      attributes: { some: { isActive: true } },
    },
    select: { slug: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
}
