/**
 * E2E test DB post-seed hazırlığı — ORTAM BAĞIMSIZ (lokal Docker + CI servis container).
 *
 * Daha önce bu adımlar `docker exec tarodan-postgres psql ...` ile yapılıyordu; bu yalnız
 * yerelde (container adı sabit) çalışıyordu. Prisma client üzerinden çalıştırınca hem yerel
 * hem CI'da (DATABASE_URL ile) aynı şekilde çalışır.
 *
 * Yaptıkları:
 *  1) Aktif ürün stoklarını yükseltir (tek koşuda 136 ardışık alım seed-stoğunu tüketmesin).
 *  2) /dev/reset-state hook'unun kullandığı seed snapshot tablolarını (_seed_*) oluşturur.
 *
 * DATABASE_URL env'i ile çağrılır (global-setup TEST_DATABASE_URL'i geçirir).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // 1) Stokları yüksek tut — stok-bitti journey'leri kendi düşük stoğunu dev-hook ile ayarlar.
  await prisma.$executeRawUnsafe(
    `UPDATE products SET quantity = 100000 WHERE status = 'active'`,
  );

  // 2) Seed snapshot tabloları — non-seed ürün/kullanıcı/üyelik bunlarla ayıklanır.
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS _seed_products`);
  await prisma.$executeRawUnsafe(`CREATE TABLE _seed_products AS SELECT id FROM products`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS _seed_users`);
  await prisma.$executeRawUnsafe(`CREATE TABLE _seed_users AS SELECT id FROM users`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS _seed_memberships`);
  await prisma.$executeRawUnsafe(
    `CREATE TABLE _seed_memberships AS SELECT * FROM user_memberships`,
  );

  console.log('[e2e] post-seed hazırlık tamam (stok yükseltildi + seed snapshot oluşturuldu)');
}

main()
  .catch((e) => {
    console.error('[e2e] e2e-prepare hatası:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
