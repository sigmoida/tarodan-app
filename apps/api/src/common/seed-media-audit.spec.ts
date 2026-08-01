import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Faz 2 — Seed medya denetimi: seed dosyaları görsel olarak YALNIZ bucket
 * kaynaklarını (seed-assets → {env}/… kopyası) kullanabilir. Harici placeholder
 * servisleri ve repo içi statik yollar yasak — bunlar bir kez sızdığında DB'de
 * kalıcılaşıyor ve remotePatterns'ta ölü domain izinleri bırakıyordu.
 */
const FORBIDDEN = [
  "picsum.photos",
  "placehold.co",
  "via.placeholder.com",
  "images.unsplash.com",
  "api.dicebear.com",
  "ui-avatars.com",
  "autopartia.com",
  "/photos/logolar",
];

function collectSeedFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectSeedFiles(full));
    } else if (name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("seed media audit", () => {
  it("seed files contain no external image services or repo static paths", () => {
    const prismaDir = join(__dirname, "../../prisma");
    const files = collectSeedFiles(prismaDir).filter((f) =>
      /seed[^/]*\.ts$|seed-edge/.test(f),
    );
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (content.includes(pattern)) {
          violations.push(`${file} → ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
