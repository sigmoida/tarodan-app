import { PrismaService } from "../../prisma";

/**
 * Kategori ağacı yürüyüşünün TEK kaynağı.
 *
 * Ağaç üç ayrı yerde elle yürünüyordu (bütünlük kontrolleri, admin kataloğu,
 * kampanya uygunluğu) ve her kopya döngü korumasını farklı çözüyordu — biri
 * `visited` seti tutuyor, biri sabit-nokta döngüsü çeviriyor, biri hiç
 * korumuyordu. Bozuk bir `parentId` zinciri (döngü) bu üçünde üç farklı sonuç
 * veriyordu: hata, sonsuz döngü ya da sessizce eksik sonuç.
 *
 * Ağacın kendisi küçüktür (onlarca satır); pahalı olan sorgu değil, kuralın
 * kopyalanmasıdır.
 */

export interface CategoryEdge {
  id: string;
  parentId: string | null;
}

/** Ağaç yürüyüşü için gereken TEK veri — `id` ve `parentId`. */
export function loadCategoryEdges(
  prisma: PrismaService,
): Promise<CategoryEdge[]> {
  return prisma.category.findMany({ select: { id: true, parentId: true } });
}

export function buildCategoryParentMap(
  edges: CategoryEdge[],
): Map<string, string | null> {
  return new Map(edges.map((edge) => [edge.id, edge.parentId]));
}

/**
 * Kategorinin KENDİSİ + köke kadar tüm üst kategorileri.
 *
 * "Bu ürün, üst kategoriye tanımlanmış bir kurala giriyor mu?" sorusunun
 * cevabı: ürünün kategorisinin ata zincirinde o kategori var mı.
 */
export function ancestorCategoryIds(
  parentById: Map<string, string | null>,
  categoryId: string | null | undefined,
): Set<string> {
  const chain = new Set<string>();
  let currentId = categoryId ?? null;
  // Döngü koruması: bozuk veri (a→b→a) sonsuz döngüye dönüşmemeli. `chain`
  // zaten görülen id'yi tuttuğu için ikinci ziyarette durur.
  while (currentId && !chain.has(currentId)) {
    chain.add(currentId);
    currentId = parentById.get(currentId) ?? null;
  }
  return chain;
}

/** Kategorinin KENDİSİ + tüm alt kategorileri (her derinlikte). */
export function descendantCategoryIds(
  edges: CategoryEdge[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.parentId) continue;
    const siblings = childrenByParent.get(edge.parentId) ?? [];
    siblings.push(edge.id);
    childrenByParent.set(edge.parentId, siblings);
  }

  const collected = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const currentId = queue.pop() as string;
    for (const childId of childrenByParent.get(currentId) ?? []) {
      // Zaten görülen çocuk kuyruğa tekrar girmez → döngülü veride de biter.
      if (collected.has(childId)) continue;
      collected.add(childId);
      queue.push(childId);
    }
  }
  return collected;
}
