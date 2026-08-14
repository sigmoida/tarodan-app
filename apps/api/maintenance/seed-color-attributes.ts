/**
 * Global "Renk" attribute grubunu CANLI veritabanına ekler.
 *
 * Neden ayrı bir script: renk kataloğu lansman seed'inin veri dosyasında
 * (`data/launch/attribute-groups.json`) duruyor, ama `seed-launch.ts` bir RESET
 * aracıdır — komisyon setini ve kargo tarifelerini dosyadaki değerlere geri
 * çeker, lansman ilanlarını yeniden yazar ve `LAUNCH_SELLER_PASSWORD` ister.
 * Veri girmiş bir canlı veritabanında çalıştırılamaz. Bu script yalnız tek bir
 * attribute grubunu yazar.
 *
 * Admin panelinden elle girmek de bir seçenek DEĞİL: slug orada `value`'dan
 * türetiliyor ("Kırmızı" → `kirmizi`), oysa katalog `red` bekliyor — form,
 * filtre ve backfill hep slug üzerinden eşleşiyor.
 *
 * Kaynak, lansman seed'iyle AYNI dosyadır; iki yerde iki renk listesi tutmak,
 * ikisinin ayrışması demek olurdu. Yazma tamamen `upsert`: tekrar çalıştırmak
 * güvenlidir, gruptaki elle yapılmış eklemeler silinmez.
 *
 * Kullanım:
 *   node dist-seed/maintenance/seed-color-attributes.js --dry-run
 *   node dist-seed/maintenance/seed-color-attributes.js
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { COLOR_GROUP_SLUG } from "../src/common/helpers/attribute-groups";

const prisma = new PrismaClient();

// ts-node'da `apps/api/maintenance/`, derlenmişte `dist-seed/maintenance/` —
// `build:seed` veriyi ikisinde de `../prisma/data/launch` altına koyar.
const DATA_FILE = join(
  __dirname,
  "..",
  "prisma",
  "data",
  "launch",
  "attribute-groups.json",
);

interface AttributeValueData {
  value: string;
  slug: string;
  displayValue: string;
  color?: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface AttributeGroupData {
  slug: string;
  name: string;
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
  values: AttributeValueData[];
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const groups = JSON.parse(
    readFileSync(DATA_FILE, "utf8"),
  ) as AttributeGroupData[];
  const group = groups.find((g) => g.slug === COLOR_GROUP_SLUG);
  if (!group) {
    throw new Error(
      `'${COLOR_GROUP_SLUG}' grubu ${DATA_FILE} içinde yok — veri dosyası eksik.`,
    );
  }

  const existingGroup = await prisma.attributeGroup.findUnique({
    where: { slug: group.slug },
    select: { id: true },
  });
  const existingSlugs = existingGroup
    ? new Set(
        (
          await prisma.attribute.findMany({
            where: { groupId: existingGroup.id },
            select: { slug: true },
          })
        ).map((a) => a.slug),
      )
    : new Set<string>();

  const created = group.values.filter((v) => !existingSlugs.has(v.slug)).length;
  const updated = group.values.length - created;

  console.log(
    `${dryRun ? "[dry-run] " : ""}renk grubu: ` +
      `${existingGroup ? "mevcut, güncellenecek" : "yeni oluşturulacak"} · ` +
      `${group.values.length} değer (${created} yeni, ${updated} güncelleme)`,
  );

  if (dryRun) return;

  const groupData = {
    name: group.name,
    isRequired: group.isRequired,
    sortOrder: group.sortOrder,
    isActive: group.isActive,
  };
  const saved = await prisma.attributeGroup.upsert({
    where: { slug: group.slug },
    create: { slug: group.slug, ...groupData },
    update: groupData,
  });

  for (const value of group.values) {
    const valueData = {
      value: value.value,
      displayValue: value.displayValue,
      color: value.color ?? null,
      sortOrder: value.sortOrder,
      isActive: value.isActive,
    };
    await prisma.attribute.upsert({
      where: { groupId_slug: { groupId: saved.id, slug: value.slug } },
      create: { groupId: saved.id, slug: value.slug, ...valueData },
      update: valueData,
    });
  }

  console.log("renk grubu hazır.");
}

main()
  .catch((error) => {
    console.error("Renk grubu yazılamadı.", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
