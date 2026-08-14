/**
 * Eski ilanların serbest metin rengini katalog seçimine çevirir.
 *
 * Renk `products.color` kolonunda düz metindi ("Kırmızı", "kirmizi", "Red",
 * "Altın/Kahverengi"). Artık ilan formu global "color" attribute grubundan
 * seçtiriyor ve filtre bu grup üzerinden çalışıyor; bu script eski kayıtları
 * aynı hatta taşır:
 *
 *  1. Metni parçalara ayırır ve katalogla eşleştirir (`resolveColorsFromText`)
 *  2. Eşleşenler için ProductAttribute bağı kurar
 *  3. TÜM parçalar eşleştiyse kolonu kanonik adlarla yeniden yazar
 *     (search_text trigger'ı `color` değişince kendiliğinden tazelenir)
 *  4. Eşleşmeyen değerleri raporlar ve kolonda OLDUĞU GİBİ bırakır — bilgi
 *     kaybolmasın; satıcı ilanı düzenlerken listeden seçmek zorunda kalır.
 *
 * Kullanım:
 *   node dist-seed/maintenance/backfill-product-colors.js --dry-run
 *   node dist-seed/maintenance/backfill-product-colors.js
 */
import { PrismaClient } from "@prisma/client";
import {
  COLOR_GROUP_SLUG,
  COLOR_LABEL_SEPARATOR,
  MAX_PRODUCT_COLORS,
  resolveColorsFromText,
} from "../src/common/helpers/attribute-groups";

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

interface Summary {
  scanned: number;
  linked: number;
  normalized: number;
  alreadyLinked: number;
  unresolved: number;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const colorOptions = (
    await prisma.attribute.findMany({
      where: { isActive: true, group: { slug: COLOR_GROUP_SLUG } },
      select: { id: true, slug: true, value: true, displayValue: true },
      orderBy: { sortOrder: "asc" },
    })
  ).map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.displayValue || row.value,
  }));

  if (colorOptions.length === 0) {
    throw new Error(
      `Renk grubu ("${COLOR_GROUP_SLUG}") boş veya yok — önce seed'i çalıştırın.`,
    );
  }
  const idBySlug = new Map(colorOptions.map((row) => [row.slug, row.id]));
  const options = colorOptions.map(({ slug, label }) => ({ slug, label }));

  const summary: Summary = {
    scanned: 0,
    linked: 0,
    normalized: 0,
    alreadyLinked: 0,
    unresolved: 0,
  };
  const unmatchedCounts = new Map<string, number>();

  let cursor: string | undefined;
  for (;;) {
    const products = await prisma.product.findMany({
      where: { color: { not: null } },
      select: {
        id: true,
        color: true,
        productAttributes: {
          where: { attribute: { group: { slug: COLOR_GROUP_SLUG } } },
          select: { attributeId: true },
        },
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (products.length === 0) break;
    cursor = products[products.length - 1].id;

    for (const product of products) {
      summary.scanned += 1;
      if (product.productAttributes.length > 0) {
        // Zaten katalog seçimi var (yeni akışla kaydedilmiş) — dokunma.
        summary.alreadyLinked += 1;
        continue;
      }

      const resolved = resolveColorsFromText(product.color ?? "", options);
      for (const value of resolved.unmatched) {
        unmatchedCounts.set(value, (unmatchedCounts.get(value) ?? 0) + 1);
      }
      if (resolved.slugs.length === 0) {
        summary.unresolved += 1;
        continue;
      }

      // Form en fazla MAX_PRODUCT_COLORS renge izin veriyor; eski metin daha
      // fazlasını içeriyorsa ilk seçimler alınır (kalanı raporda görünür).
      const slugs = resolved.slugs.slice(0, MAX_PRODUCT_COLORS);
      const labels = resolved.labels.slice(0, MAX_PRODUCT_COLORS);
      const canonical = labels.join(COLOR_LABEL_SEPARATOR);
      const fullyMatched =
        resolved.unmatched.length === 0 &&
        slugs.length === resolved.slugs.length;

      if (!dryRun) {
        await prisma.$transaction([
          prisma.productAttribute.createMany({
            data: slugs.map((slug) => ({
              productId: product.id,
              attributeId: idBySlug.get(slug)!,
            })),
            skipDuplicates: true,
          }),
          ...(fullyMatched && canonical !== product.color
            ? [
                prisma.product.update({
                  where: { id: product.id },
                  data: { color: canonical },
                }),
              ]
            : []),
        ]);
      }

      summary.linked += 1;
      if (fullyMatched && canonical !== product.color) summary.normalized += 1;
    }
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}renk backfill: ` +
      `${summary.scanned} ilan tarandı, ${summary.linked} bağlandı, ` +
      `${summary.normalized} kolon normalize edildi, ` +
      `${summary.alreadyLinked} zaten seçili, ${summary.unresolved} eşleşmedi`,
  );
  if (unmatchedCounts.size > 0) {
    const rows = [...unmatchedCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => `  ${count.toString().padStart(5)} × ${value}`);
    console.log(
      `Katalogda karşılığı olmayan değerler (adminden eklenebilir):\n${rows.join("\n")}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
