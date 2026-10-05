/**
 * LANSMAN seed'i — canlıya çıkılacak asgari veri.
 *
 * `seed-production.ts` yalnız iskeleti kurar (uygulama açılsın diye); iş
 * değerlerinin tek kaynağı burasıdır: `prisma/data/launch/*.json`. Demo/staging
 * seed'inden (`seed.ts` + `seed-demo-config.ts`) TAMAMEN bağımsızdır ve öyle
 * kalmalıdır — `src/common/seed-independence.spec.ts` bunu CI'da doğrular.
 *
 * Yazdıkları: onaylanmış iş değerleri (üyelik/vergi/tarife/ayarlar), katalog
 * (kategori, marka, model, üretici, özellik), ACTIVE komisyon kural seti,
 * kurumsal satıcı + üyeliği, süper admin adresi (= depo adresi) ve GÖRSELSİZ,
 * `inactive` durumdaki lansman ilanları.
 *
 * Referans/katalog/komisyon/ilan yazım parçaları `seed-launch-core.ts`'te ve
 * UAT seed'iyle (`seed-uat.ts`) PAYLAŞILIR; bu dosya yalnız production guard'ı,
 * kurumsal satıcı ve sıralamayı tutar.
 *
 * Operasyonel veri (sipariş, takas, ödeme) bilinçli olarak YOKTUR.
 * Tekrar çalıştırılabilir: her adım doğal anahtarı üzerinden upsert eder.
 */
import {
  BusinessStatus,
  MembershipTierType,
  PrismaClient,
  SellerType,
  SubscriptionStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import {
  Accounts,
  BusinessConfig,
  CommissionConfig,
  load,
  loadProductLookups,
  log,
  ProductData,
  seedBusinessConfig,
  seedCatalog,
  seedCommissionRuleSet,
  seedWarehouseAddress,
  upsertAddress,
  upsertSeedProduct,
} from "./seed-launch-core";

const prisma = new PrismaClient();

// ───────────────────────── guard ─────────────────────────

function assertProduction(): void {
  if (process.env.APP_ENV !== "production") {
    throw new Error(
      "Launch seed requires APP_ENV=production; it writes the live catalog.",
    );
  }
}

// ───────────────────────── hesaplar ─────────────────────────

async function seedCorporateSeller(
  accounts: Accounts,
): Promise<string> {
  const seller = accounts.corporateSeller;
  const email = (process.env.LAUNCH_SELLER_EMAIL || seller.email)
    .trim()
    .toLowerCase();
  const password = process.env.LAUNCH_SELLER_PASSWORD?.trim();
  if (!password) {
    throw new Error("LAUNCH_SELLER_PASSWORD is required");
  }
  if (password.length < 16 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("LAUNCH_SELLER_PASSWORD must be between 16 and 72 bytes");
  }
  if (email === "platform@tarodan.com") {
    throw new Error("Platform service account cannot be the launch seller");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // `SellerType` DOĞRULAMA tipidir (individual/verified/platform), kurumsallık
  // değil. "Kurumsal" olmak `businessStatus=approved` + companyName + taxId
  // üçlüsünden türer (order-commission.helper.ts resolveCommissionSellerType);
  // BUSINESS komisyon tipi ise üyelikten gelir.
  const identity = {
    displayName: seller.displayName,
    isVerified: true,
    isEmailVerified: true,
    isSeller: true,
    sellerType: SellerType.verified,
    businessStatus: BusinessStatus.approved,
    companyName: seller.companyName,
    taxId: seller.taxId,
    taxOffice: seller.taxOffice,
    companyType: seller.companyType,
    companyCity: seller.companyCity,
    companyDistrict: seller.companyDistrict,
    phone: seller.phone,
    acceptsMarketingEmails: false,
  };
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, ...identity },
    update: { passwordHash, ...identity, isBanned: false, deletedAt: null },
  });

  // Hesap tipi kodu kurumsalı yansıtmalı: bireysel "B" yerine "K". Numara kalıcı
  // kimliktir, yalnız önek değişir (docs/CODE_SCHEME.md).
  if (user.adminCode?.startsWith("B")) {
    await prisma.user.update({
      where: { id: user.id },
      data: { adminCode: `K${user.adminCode.slice(1)}` },
    });
  }

  // `saleCapableSellerWhere` kurumsal satıcının ürünlerini vitrinde göstermek
  // için AKTİF ve süresi dolmamış BUSINESS üyelik arar. Süre biterse satıcı
  // satış yapamaz VE bütün ilanları katalogdan düşer — bu yüzden uzun dönem.
  const businessTier = await prisma.membershipTier.findUniqueOrThrow({
    where: { type: MembershipTierType.business },
  });
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setFullYear(
    periodEnd.getFullYear() + seller.membership.periodYears,
  );
  const membership = {
    tierId: businessTier.id,
    status: SubscriptionStatus.active,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  };
  await prisma.userMembership.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...membership },
    update: membership,
  });

  await upsertAddress(prisma, user.id, seller.address);
  log(
    `corporate seller ${email} (${seller.companyName}), business membership until ` +
      periodEnd.toISOString().slice(0, 10),
  );
  return user.id;
}


// ───────────────────────── ilanlar ─────────────────────────

async function seedProducts(sellerId: string): Promise<void> {
  const products = load<ProductData[]>("products.json");
  const lookups = await loadProductLookups(prisma);
  for (const item of products) {
    await upsertSeedProduct(prisma, lookups, sellerId, item);
  }

  const byStatus = products.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  log(
    `products: ${products.length} (${Object.entries(byStatus)
      .map(([status, count]) => `${status}=${count}`)
      .join(", ")}), no images by design`,
  );
}

// ───────────────────────── main ─────────────────────────

async function main(): Promise<void> {
  assertProduction();

  const accounts = load<Accounts>("accounts.json");
  const businessConfig = load<BusinessConfig>("business-config.json");
  const commission = load<CommissionConfig>("commission.json");

  await seedBusinessConfig(prisma, businessConfig);
  await seedCatalog(prisma);
  await seedCommissionRuleSet(prisma, commission);
  const sellerId = await seedCorporateSeller(accounts);
  await seedWarehouseAddress(prisma, accounts, { renameAdmin: true });
  await seedProducts(sellerId);

  log("Launch data is ready.");
}

main()
  .catch((error) => {
    console.error("[launch-seed] failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
