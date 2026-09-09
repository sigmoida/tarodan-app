/**
 * Geçmişte silinmiş hesaplar için kimlik arşivini geriye dönük doldurur.
 *
 * Arşiv (`deleted_user_identities`) yalnız silme anında yazılıyor; bu script'ten
 * önce silinmiş hesaplar için aylık resmî bildirim yapılamıyor. Anonimleştirme
 * `users` satırında e-postayı/telefonu/VKN'yi yok etti ama kimlik parçaları
 * BAŞKA tablolarda kaldı — bu script onları toparlar.
 *
 * Alan önceliği `src/common/helpers/deleted-user-identity.ts`'te; silme yolu ile
 * BİREBİR aynı mantık kullanılır (ikinci bir kopya kaçınılmaz olarak ayrışırdı).
 * Kurtarılamayan alan boş bırakılır — tahmin edilmez; hangi alanın nereden
 * geldiği `source_detail` / `source_refs` kolonlarına yazılır.
 *
 * Kaynaklar zamanla TÜKENİYOR: `email_logs` 90, `security_logs` 180 gün sonra
 * log-retention cron'u ile siliniyor. Ne kadar beklenirse o kadar az e-posta
 * kurtarılır — önce `--dry-run` ile kaybın büyüklüğü görülmeli.
 *
 * Kullanım:
 *   node dist-seed/maintenance/backfill-deleted-user-identities.js --dry-run
 *   node dist-seed/maintenance/backfill-deleted-user-identities.js
 */
import {
  DeletionActor,
  IdentitySnapshotSource,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import {
  computeRetainUntil,
  resolveIdentityFields,
  type IdentitySourceKey,
} from "../src/common/helpers/deleted-user-identity";

const prisma = new PrismaClient();
const BATCH_SIZE = 200;

interface Summary {
  scanned: number;
  written: number;
  skipped: number;
  /** Alan → kaç kayıtta çözülebildi. */
  resolvedByField: Record<string, number>;
  /** Kaynak → kaç alanı besledi. */
  resolvedBySource: Record<string, number>;
  /** Hiçbir kimlik alanı çözülemeyen kullanıcılar (elle incelensin). */
  emptyUserIds: string[];
}

function bump(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

async function collectSources(userId: string) {
  const [
    bankAccount,
    corporateApplication,
    elogoInvoice,
    order,
    payoutTransfer,
    auditLog,
    emailLog,
    securityLog,
    productCount,
  ] = await Promise.all([
    prisma.sellerBankAccount.findUnique({
      where: { userId },
      select: {
        tcKimlikNo: true,
        taxId: true,
        iban: true,
        accountHolder: true,
      },
    }),
    prisma.corporateApplication.findUnique({
      where: { userId },
      select: {
        id: true,
        authorizedFullName: true,
        companyLegalName: true,
        companyTitle: true,
        companyEmail: true,
        companyAddress: true,
        companyCity: true,
        companyDistrict: true,
        phone: true,
        contactPhone: true,
        taxId: true,
        taxOffice: true,
        companyType: true,
        iban: true,
        bankAccountHolder: true,
        stakeholders: {
          select: { fullName: true, identityType: true, identityNumber: true },
        },
      },
    }),
    // `pending` belge alıcı bilgisinde yer tutucu taşıyabiliyor; kesilmiş
    // belgeler tercih edilir.
    prisma.elogoInvoice.findFirst({
      where: { recipientUserId: userId, status: { in: ["sent", "signed"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        recipientVknTckn: true,
        recipientName: true,
        recipientEmail: true,
        recipientCity: true,
        recipientDistrict: true,
        recipientStreet: true,
      },
    }),
    prisma.order.findFirst({
      where: { buyerId: userId, shippingAddress: { not: Prisma.DbNull } },
      orderBy: { createdAt: "desc" },
      select: { id: true, shippingAddress: true },
    }),
    prisma.payoutTransfer.findFirst({
      where: { sellerId: userId, status: "completed" },
      orderBy: { createdAt: "desc" },
      select: { id: true, transferIban: true, transferName: true },
    }),
    // `audit_logs` hiç purge edilmiyor → en dayanıklı e-posta/ad kaynağı.
    prisma.auditLog.findFirst({
      where: {
        entityType: "User",
        entityId: userId,
        action: "user_delete_never_logged_in",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, oldValue: true },
    }),
    prisma.emailLog.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { to: true },
    }),
    prisma.securityLog.findFirst({
      where: { userId, email: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { email: true },
    }),
    prisma.product.count({ where: { sellerId: userId } }),
  ]);

  const auditValue = (auditLog?.oldValue ?? null) as {
    email?: string | null;
    displayName?: string | null;
  } | null;

  return {
    bankAccount,
    corporateApplication,
    elogoInvoice,
    order,
    payoutTransfer,
    auditLog: auditLog
      ? {
          id: auditLog.id,
          email: auditValue?.email ?? null,
          displayName: auditValue?.displayName ?? null,
        }
      : null,
    emailLogAddress: emailLog?.to ?? null,
    securityLogAddress: securityLog?.email ?? null,
    hasProducts: productCount > 0,
    /** Denetim kaydı yoksa "kullanıcı sildi" ÇIKARILAMAZ — `unknown` yazılır. */
    deletedByAdmin: !!auditLog,
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const summary: Summary = {
    scanned: 0,
    written: 0,
    skipped: 0,
    resolvedByField: {},
    resolvedBySource: {},
    emptyUserIds: [],
  };

  let cursor: string | undefined;
  for (;;) {
    const users = await prisma.user.findMany({
      where: { deletedAt: { not: null }, deletedIdentity: null },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        phone: true,
        birthDate: true,
        taxId: true,
        taxOffice: true,
        companyName: true,
        companyType: true,
        companyCity: true,
        companyDistrict: true,
        sellerType: true,
        businessStatus: true,
        isSeller: true,
        adminCode: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    if (users.length === 0) break;
    cursor = users[users.length - 1].id;

    for (const user of users) {
      summary.scanned += 1;
      const sources = await collectSources(user.id);
      const resolved = resolveIdentityFields({ user, ...sources });

      for (const [field, source] of Object.entries(resolved.sourceDetail)) {
        if (source === null) continue;
        bump(summary.resolvedByField, field);
        bump(summary.resolvedBySource, source as IdentitySourceKey);
      }

      const anyIdentity =
        resolved.values.email ??
        resolved.values.displayName ??
        resolved.values.nationalId ??
        resolved.values.taxId ??
        resolved.values.phone;
      if (!anyIdentity) summary.emptyUserIds.push(user.id);

      if (dryRun) continue;

      // deletedAt NOT NULL filtresiyle geldiği için burada kesin dolu.
      const deletedAt = user.deletedAt as Date;
      await prisma.deletedUserIdentity.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          ...resolved.values,
          deletedAt,
          deletedByActor: sources.deletedByAdmin
            ? DeletionActor.admin
            : DeletionActor.unknown,
          source: IdentitySnapshotSource.backfill,
          sourceDetail: resolved.sourceDetail,
          sourceRefs: resolved.sourceRefs,
          retainUntil: computeRetainUntil(deletedAt),
        },
        update: {},
      });
      summary.written += 1;
    }
  }

  summary.skipped = summary.scanned - summary.written;

  console.log(
    dryRun ? "\n[DRY RUN] Yazma yapılmadı.\n" : "\nBackfill bitti.\n",
  );
  console.log(`Arşivsiz silinmiş hesap : ${summary.scanned}`);
  console.log(`Yazılan arşiv satırı    : ${summary.written}`);
  console.log("\nAlan bazında kurtarma:");
  for (const [field, count] of Object.entries(summary.resolvedByField).sort()) {
    const pct = summary.scanned
      ? Math.round((count / summary.scanned) * 100)
      : 0;
    console.log(
      `  ${field.padEnd(20)} ${String(count).padStart(6)}  (%${pct})`,
    );
  }
  console.log("\nKaynak bazında katkı:");
  for (const [source, count] of Object.entries(
    summary.resolvedBySource,
  ).sort()) {
    console.log(`  ${source.padEnd(24)} ${String(count).padStart(6)}`);
  }
  if (summary.emptyUserIds.length > 0) {
    console.log(
      `\nHiçbir kimlik alanı çözülemeyen ${summary.emptyUserIds.length} hesap ` +
        `(elle incelenmeli, tahmin YAZILMADI):`,
    );
    for (const id of summary.emptyUserIds.slice(0, 50)) console.log(`  ${id}`);
    if (summary.emptyUserIds.length > 50) {
      console.log(`  … ve ${summary.emptyUserIds.length - 50} tane daha`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
