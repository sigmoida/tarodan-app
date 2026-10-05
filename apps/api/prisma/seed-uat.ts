/**
 * UAT (staging) seed'i — gerçek posta kutulu SABİT kişiler + production'daki
 * referans verinin aynısı. Demo seed'inin (`seed.ts`, yüzlerce yapay kullanıcı
 * ve sipariş/takas senaryosu) yerine staging reset workflow'unda koşar.
 *
 * Yazdıkları:
 *  - Referans veri: üyelik katmanları, vergi, kargo tarifesi, ayarlar, katalog
 *    ve ACTIVE komisyon kural seti. Hepsi lansman seed'iyle PAYLAŞILAN
 *    fonksiyonlardan (`seed-launch-core.ts`) ve aynı veriden
 *    (`data/launch/*.json`) gelir — ikinci bir kopya yoktur.
 *  - Kişiler (`data/uat/accounts.json`): üyeler düz kullanıcıdır; personel aynı
 *    `users` tablosu + `admin_users` satırıdır (bootstrap-production-admin.ts
 *    ile aynı biçim). Üyelerin yasal ad/TCKN ve onay kayıtları BİLİNÇLİ boştur:
 *    kişiler zorunlu onay ve kimlik diyaloglarını kendileri geçer.
 *  - Her üyeye birkaç ACTIVE başlangıç ilanı (`data/uat/listings.json`),
 *    lansman kataloğundan. Görseller bu dosyada değil, workflow'un ardından
 *    çalıştırdığı `seed-media.ts` ile bağlanır (slug eşlemesi).
 *
 * Sipariş, teklif, takas, ödeme, bildirim gibi operasyonel veri YOKTUR.
 *
 * Şifre `UAT_SEED_PASSWORD` env'inden gelir (zorunlu, asla loglanmaz). Tekrar
 * koşulabilir; var olan bir hesabın şifresi `UAT_SEED_RESET_PASSWORDS=1`
 * verilmedikçe DEĞİŞMEZ. `--check` DB'ye dokunmadan guard'ı, şifreyi ve veri
 * dosyalarını doğrular (workflow bunu veritabanı silinmeden ÖNCE koşar).
 *
 * Demo seed'ine bağlı değildir — `seed-independence.spec.ts` doğrular.
 */
import { AdminRole, PrismaClient, SellerType } from "@prisma/client";
import * as bcrypt from "bcrypt";
import {
  assertUatSeedAllowed,
  parseUatAccounts,
  parseUatListings,
  planUatAccountSync,
  resolveUatPassword,
  shouldResetPasswords,
  UatAccountKind,
  UatMember,
} from "../src/common/helpers/seed-uat-accounts";
import {
  Accounts,
  BusinessConfig,
  CommissionConfig,
  load,
  loadJson,
  loadProductLookups,
  ProductData,
  productSlug,
  seedBusinessConfig,
  seedCatalog,
  seedCommissionRuleSet,
  seedWarehouseAddress,
  upsertSeedProduct,
} from "./seed-launch-core";

const prisma = new PrismaClient();

const log = (message: string) => console.log(`[uat-seed] ${message}`);

interface SyncContext {
  resetPasswords: boolean;
}

/** bcrypt maliyeti yüksek: yalnız gerçekten yazılacaksa ve bir kez hesaplanır. */
const makeHasher = (password: string) => {
  let cached: Promise<string> | null = null;
  return () => (cached ??= bcrypt.hash(password, 12));
};

/**
 * Personel hesabı müşteri izi taşıyorsa (ilan/sipariş) personele terfi
 * ettirilmez — personel web/mobile giremez (admin-staff.service ile aynı kural).
 */
async function assertNoCustomerFootprint(userId: string): Promise<void> {
  const admin = await prisma.adminUser.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (admin) return;
  const [products, buyerOrders, sellerOrders] = await Promise.all([
    prisma.product.count({ where: { sellerId: userId } }),
    prisma.order.count({ where: { buyerId: userId } }),
    prisma.order.count({ where: { sellerId: userId } }),
  ]);
  if (products + buyerOrders + sellerOrders > 0) {
    throw new Error(
      "A staff email already belongs to a customer account with activity; staff and member accounts must stay separate.",
    );
  }
}

async function syncAccount(
  entry: UatMember & { role?: AdminRole },
  kind: UatAccountKind,
  context: SyncContext,
  hash: () => Promise<string>,
): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: entry.email },
    select: { id: true },
  });
  const plan = planUatAccountSync({
    kind,
    exists: Boolean(existing),
    resetPasswords: context.resetPasswords,
  });
  if (kind === "staff" && existing) {
    await assertNoCustomerFootprint(existing.id);
  }

  let userId: string;
  if (!existing) {
    // Üye: kayıt formundaki bireysel satıcı ile aynı alanlar (e-posta zaten
    // doğrulanmış). Personel: bootstrap-production-admin ile aynı alanlar.
    // Kullanıcı adı DB varsayılanıdır (legacy_…); üye kendi seçer.
    const created = await prisma.user.create({
      data: {
        email: entry.email,
        passwordHash: await hash(),
        displayName: entry.displayName,
        isVerified: true,
        isEmailVerified: true,
        isSeller: kind === "member",
        sellerType: kind === "member" ? SellerType.individual : null,
        acceptsMarketingEmails: false,
      },
      select: { id: true },
    });
    userId = created.id;
  } else {
    userId = existing.id;
    const data = {
      ...(plan.writePassword ? { passwordHash: await hash() } : {}),
      ...(plan.reconcileFlags
        ? {
            isVerified: true,
            isEmailVerified: true,
            isBanned: false,
            bannedAt: null,
            bannedBy: null,
            bannedReason: null,
            deletedAt: null,
          }
        : {}),
    };
    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id: userId }, data });
    }
  }

  if (kind === "staff" && entry.role) {
    const isSuper = entry.role === AdminRole.super_admin;
    await prisma.adminUser.upsert({
      where: { userId },
      create: {
        userId,
        role: entry.role,
        ...(isSuper ? { permissions: { all: true } } : {}),
        isActive: true,
      },
      update: {
        role: entry.role,
        ...(isSuper ? { permissions: { all: true } } : {}),
        isActive: true,
      },
    });
  }

  const action = plan.create
    ? "created"
    : plan.writePassword
      ? "existing, password reset"
      : "existing, password kept";
  log(`${kind} ${entry.email}: ${action}`);
  return userId;
}

async function main(): Promise<void> {
  assertUatSeedAllowed(process.env);

  const accounts = parseUatAccounts(loadJson("uat", "accounts.json"));
  const listings = parseUatListings(
    loadJson("uat", "listings.json"),
    accounts.members.map((member) => member.email),
  );
  const password = resolveUatPassword(process.env);
  const context: SyncContext = {
    resetPasswords: shouldResetPasswords(process.env),
  };

  if (process.argv.includes("--check")) {
    log(
      `check OK: ${accounts.members.length} members, ${accounts.staff.length} staff, ${listings.length} listings; password accepted.`,
    );
    return;
  }

  // Referans veri — lansman seed'iyle aynı fonksiyonlar, aynı veri dosyaları.
  const launchAccounts = load<Accounts>("accounts.json");
  const businessConfig = load<BusinessConfig>("business-config.json");
  const commission = load<CommissionConfig>("commission.json");
  await seedBusinessConfig(prisma, businessConfig);
  await seedCatalog(prisma);
  await seedCommissionRuleSet(prisma, commission);

  const hash = makeHasher(password);
  const userIds = new Map<string, string>();
  for (const staff of accounts.staff) {
    userIds.set(staff.email, await syncAccount(staff, "staff", context, hash));
  }
  for (const member of accounts.members) {
    userIds.set(
      member.email,
      await syncAccount(member, "member", context, hash),
    );
  }

  // Depo adresi (readiness ister): ilk süper adminin adresi. Adminler gerçek
  // kişiler olduğu için görünen adlarına dokunulmaz.
  await seedWarehouseAddress(prisma, launchAccounts, { renameAdmin: false });

  // Başlangıç ilanları yalnız YOKSA yazılır: yeniden koşu, testin sattığı/
  // düzenlediği bir ilanı eski haline döndürmesin.
  const lookups = await loadProductLookups(prisma);
  let created = 0;
  for (const listing of listings) {
    const item = listing as unknown as ProductData;
    const slug = productSlug(item);
    const present = await prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (present) continue;
    await upsertSeedProduct(
      prisma,
      lookups,
      userIds.get(listing.ownerEmail)!,
      item,
    );
    created += 1;
  }
  log(
    `starter listings: ${created} created, ${listings.length - created} already present`,
  );

  log("UAT data is ready.");
}

main()
  .catch((error) => {
    console.error("[uat-seed] failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
