import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

type HwAttribute = { slug: string; name: string; color?: string };
type HwGroup = { slug: string; name: string; sortOrder: number; attributes: HwAttribute[] };
type HwTaxonomy = {
  manufacturerSlug: string;
  source: string;
  totals: { groups: number; attributes: number };
  groups: HwGroup[];
};

const DATA_FILE = path.join(__dirname, 'data', 'hw-attributes.json');

export async function seedHotWheelsAttributes(prisma: PrismaClient): Promise<void> {
  const taxonomy = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as HwTaxonomy;
  const { manufacturerSlug, groups } = taxonomy;

  let groupCount = 0;
  let attrCount = 0;

  for (const group of groups) {
    const dbGroup = await prisma.attributeGroup.upsert({
      where: { slug: group.slug },
      update: {
        name: group.name,
        manufacturerSlug,
        sortOrder: group.sortOrder,
        isActive: true,
      },
      create: {
        slug: group.slug,
        name: group.name,
        manufacturerSlug,
        sortOrder: group.sortOrder,
        isRequired: false,
        isActive: true,
      },
    });
    groupCount++;

    for (let i = 0; i < group.attributes.length; i++) {
      const attr = group.attributes[i];
      await prisma.attribute.upsert({
        where: { groupId_slug: { groupId: dbGroup.id, slug: attr.slug } },
        update: {
          value: attr.name,
          displayValue: attr.name,
          color: attr.color ?? null,
          sortOrder: i,
          isActive: true,
        },
        create: {
          groupId: dbGroup.id,
          slug: attr.slug,
          value: attr.name,
          displayValue: attr.name,
          color: attr.color ?? null,
          sortOrder: i,
          isActive: true,
        },
      });
      attrCount++;
    }

    console.log(`  ✓ ${group.slug}: ${group.attributes.length} attributes`);
  }

  console.log(`✅ Seeded ${groupCount} HW attribute groups, ${attrCount} attributes (manufacturer=${manufacturerSlug})`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedHotWheelsAttributes(prisma)
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      return prisma.$disconnect().finally(() => process.exit(1));
    });
}
