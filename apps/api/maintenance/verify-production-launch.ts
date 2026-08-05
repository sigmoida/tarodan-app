/**
 * Reset + lansman seed'inin çıktısını doğrular.
 *
 * Eski hâli (`verify-production-empty`) kataloğun BOŞ olmasını şart koşuyordu:
 * lansman planı "boş vitrin"ken doğruydu. Artık reset asgari bir katalog ve
 * görselsiz, `inactive` ilanlar yazıyor; boşluk kontrolü bu yüzden yerini
 * "beklenen içerik + hiçbir şey satın alınabilir değil" kontrolüne bıraktı.
 *
 * İki tarafı da tutuyoruz, çünkü asıl risk boşluk değil ters yönde: lansman
 * ilanlarının kimse onaylamadan vitrine düşmesi. Public katalog ve arama
 * uçlarının BOŞ dönmesi, ilanların gerçekten `inactive` kaldığının kanıtı.
 */
import { readFileSync } from "fs";
import { join } from "path";

type JsonRecord = Record<string, unknown>;

// ts-node'da `maintenance/` → `../prisma/data/launch`, derlenmişte
// `dist-seed/maintenance/` → `dist-seed/prisma/data/launch`. Aynı göreli yol.
const DATA_DIR = join(__dirname, "..", "prisma", "data", "launch");
const loadCount = (file: string): number => {
  const parsed = JSON.parse(readFileSync(join(DATA_DIR, file), "utf8"));
  return Array.isArray(parsed) ? parsed.length : 0;
};

function asList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const record = payload as JsonRecord;
  for (const key of ["data", "products", "items", "results"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

async function getJson(baseUrl: string, path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function assertEmpty(baseUrl: string, path: string): Promise<void> {
  const payload = await getJson(baseUrl, path);
  const items = asList(payload);
  if (items.length !== 0) {
    throw new Error(
      `${path} is NOT empty (${items.length} records). Launch listings must stay inactive until they are reviewed.`,
    );
  }
}

async function assertCount(
  baseUrl: string,
  path: string,
  expected: number,
  what: string,
): Promise<void> {
  const payload = await getJson(baseUrl, path);
  const items = asList(payload);
  if (items.length !== expected) {
    throw new Error(
      `${path} returned ${items.length} ${what}, expected ${expected} from the launch data files`,
    );
  }
  console.log(`${what}: ${items.length} (as seeded)`);
}

/**
 * Beklenen içeriği kanıtlamak yetmiyor: reset sonrası aktif tarifenin kademe
 * fiyatları tek düze kalabiliyor (üçü de aynı) ve /health/ready buna "hazır"
 * diyor — kimse uyarmadan büyük paket küçük paket fiyatına kargolanıyor.
 * Tutarları log'a basıyoruz ki reset çıktısına bakan operatör admin panelinde
 * ne ayarlaması gerektiğini görsün. Bu bir ASSERT DEĞİL: düz tarife meşru bir iş
 * kararı olabilir, o yüzden yalnız uyarır.
 */
async function reportPackageTiersForReview(baseUrl: string): Promise<void> {
  const payload = (await getJson(baseUrl, "/shipping/package-tiers")) as {
    tariffVersion?: number;
    tiers?: { code?: string; amount?: number }[];
  };
  const tiers = Array.isArray(payload.tiers) ? payload.tiers : [];
  if (tiers.length === 0) return;

  const summary = tiers
    .map((tier) => `${tier.code ?? "?"}=${tier.amount ?? "?"}`)
    .join(" · ");
  console.log(
    `Shipping tariff v${payload.tariffVersion ?? "?"} package tiers: ${summary}`,
  );

  const amounts = new Set(tiers.map((tier) => Number(tier.amount)));
  if (amounts.size === 1) {
    console.warn(
      "REVIEW: every package tier costs the same. Set the real small/medium/large prices and sample dimensions in admin > System > Shipping Tariffs before unlocking the storefront.",
    );
  }
}

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "production") {
    throw new Error("Launch verification requires APP_ENV=production");
  }

  const port = process.env.PORT?.trim() || "3001";
  const baseUrl =
    process.env.PRODUCTION_LAUNCH_SMOKE_BASE_URL?.replace(/\/+$/, "") ||
    `http://127.0.0.1:${port}/api`;

  // Readiness artık gerçekten yeşile dönebilir: komisyon kapsamı ve depo adresi
  // lansman seed'iyle geliyor. Kırmızıysa hangi iş kaydının eksik olduğunu API
  // log'undaki BUSINESS_CONFIG_MISSING satırı söyler.
  const readiness = (await getJson(baseUrl, "/health/ready")) as JsonRecord;
  if (readiness.status !== "ready") {
    throw new Error("API readiness did not report ready");
  }

  await assertCount(
    baseUrl,
    "/categories",
    loadCount("categories.json"),
    "categories",
  );
  await assertCount(
    baseUrl,
    "/manufacturers",
    loadCount("manufacturers.json"),
    "manufacturers",
  );

  // Lansman ilanları `inactive` — public katalog ve arama onları GÖRMEMELİ.
  await assertEmpty(baseUrl, "/products?page=1&limit=1");
  await assertEmpty(baseUrl, "/search/products?page=1&pageSize=1");
  await assertEmpty(baseUrl, "/ads/active?position=header&device=desktop");

  console.log(
    `Production API is ready. Catalog seeded; ${loadCount("products.json")} launch listings are inactive and invisible to buyers.`,
  );
  await reportPackageTiersForReview(baseUrl);
}

main().catch((error) => {
  console.error("Launch verification failed.", error);
  process.exitCode = 1;
});
