/**
 * Aktif auto-applied (code=null) kampanyaları listeler ve anasayfadaki
 * "İndirimdekiler" section'ı neden boş görünüyor onu teşhis eder.
 *
 * Kullanım: cd apps/api && pnpm run diagnose-discounts
 */
import { PrismaClient, DiscountScope } from '@prisma/client';

const prisma = new PrismaClient();

function fmt(v: unknown): string {
  if (v == null) return 'null';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

async function main() {
  const now = new Date();
  console.log('═'.repeat(72));
  console.log('İNDİRİM TEŞHİS RAPORU');
  console.log(`Şu an: ${now.toISOString()}`);
  console.log('═'.repeat(72));

  const allDiscounts = await prisma.discount.findMany({
    orderBy: [{ isActive: 'desc' }, { priority: 'asc' }],
  });

  console.log(`\nToplam discount kaydı: ${allDiscounts.length}`);

  const activeAutoApplied = allDiscounts.filter(
    (d) =>
      d.isActive &&
      d.code == null &&
      d.startDate <= now &&
      d.endDate >= now,
  );

  console.log(
    `Şu an aktif auto-applied (code=null, tarih geçerli): ${activeAutoApplied.length}`,
  );

  if (activeAutoApplied.length === 0) {
    console.log('\n⚠️  Hiç aktif auto-applied kampanya yok.');
    console.log(
      'Anasayfadaki "İndirimdekiler" section\'ı boş görünmesinin asıl sebebi budur.',
    );
    console.log('\nManuel indirimli ürünleri sayalım (product.oldPrice != null):');
    const manualCount = await prisma.product.count({
      where: {
        oldPrice: { not: null },
        AND: [
          { OR: [{ saleStartDate: null }, { saleStartDate: { lte: now } }] },
          { OR: [{ saleEndDate: null }, { saleEndDate: { gte: now } }] },
        ],
      },
    });
    console.log(`  Aktif manuel indirimli ürün sayısı: ${manualCount}`);
    if (manualCount === 0) {
      console.log(
        '\n  ⚠️  Manuel indirimli ürün de yok. Bu yüzden anasayfa section boş görünüyor.',
      );
      console.log('\nÇözüm seçenekleri:');
      console.log(
        '  1) Admin panelinden yeni bir aktif kampanya oluştur (code boş, value > 0, tarih penceresi geçerli).',
      );
      console.log(
        '  2) Veya bir ürüne doğrudan oldPrice set et (product düzenleme ekranından veya SQL ile).',
      );
    }
    return;
  }

  console.log('\n── AKTİF KAMPANYALAR ──');
  const suspicious: typeof activeAutoApplied = [];

  for (const d of activeAutoApplied) {
    const value = Number(d.value);
    const maxDiscount = d.maxDiscountAmount != null ? Number(d.maxDiscountAmount) : null;
    const reasons: string[] = [];

    if (!(value > 0)) reasons.push(`value=${value} (≤0 → hiç indirim uygulanmaz)`);
    if (maxDiscount != null && maxDiscount <= 0)
      reasons.push(`maxDiscountAmount=${maxDiscount} (≤0 → capped to 0)`);
    if (d.scope === DiscountScope.product && d.targetProductIds.length === 0)
      reasons.push('scope=product ama targetProductIds boş (hiçbir ürüne uygulanmaz)');
    if (d.scope === DiscountScope.seller && !d.sellerId)
      reasons.push('scope=seller ama sellerId null');
    if (d.scope === DiscountScope.category && !d.categoryId)
      reasons.push('scope=category ama categoryId null');

    const flag = reasons.length > 0 ? '❌' : '✅';
    console.log(
      `\n${flag} [${d.id}] "${d.name}" (scope=${d.scope}, type=${d.type})`,
    );
    console.log(`    value: ${value}   maxDiscount: ${fmt(maxDiscount)}`);
    console.log(
      `    window: ${fmt(d.startDate)} → ${fmt(d.endDate)}   priority: ${d.priority}`,
    );
    console.log(
      `    sellerId: ${fmt(d.sellerId)}   categoryId: ${fmt(d.categoryId)}   targetProductIds: ${d.targetProductIds.length} items`,
    );
    if (reasons.length > 0) {
      for (const r of reasons) console.log(`    → ${r}`);
      suspicious.push(d);
    }
  }

  console.log('\n── ÖZET ──');
  console.log(`Aktif kampanya: ${activeAutoApplied.length}`);
  console.log(`Bozuk (indirim uygulanamaz) kampanya: ${suspicious.length}`);

  if (suspicious.length > 0) {
    console.log('\n⚠️  Bozuk kampanyalar WHERE clause\'u "bu ürünler indirimde" diye');
    console.log(
      '    geçirir AMA getEffectiveDisplayPrice her üründe null döner → response\'ta',
    );
    console.log('    isOnSale=false olur → frontend hepsini filtreler → section boş.');
    console.log('\n    Çözüm: Admin panelinden bu kampanyaların value değerini düzelt');
    console.log('    ya da pasif et (isActive=false).');
    console.log('\n    Hızlı SQL ile pasif etmek için:');
    for (const d of suspicious) {
      console.log(`      UPDATE "Discount" SET "isActive"=false WHERE id='${d.id}';`);
    }
  }

  // Basit örnek: en fazla 3 aktif ürün üzerinde getEffectiveDisplayPrice sanki
  // uygulanmış gibi deneyelim (manuel simülasyon — DiscountService'e bağımlı
  // olmamak için eligibility mantığını burada replika etmiyoruz).
  console.log('\n── ÖRNEK PRODUCT RESPONSE DOĞRULAMA ──');
  const sample = await prisma.product.findMany({
    where: { status: 'active' },
    take: 3,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      price: true,
      oldPrice: true,
      saleStartDate: true,
      saleEndDate: true,
    },
  });
  for (const p of sample) {
    const priceA = Number(p.price);
    const oldPriceDb = p.oldPrice != null ? Number(p.oldPrice) : null;
    const saleDatesValid =
      (p.saleStartDate == null || now >= p.saleStartDate) &&
      (p.saleEndDate == null || now <= p.saleEndDate);
    const isManualSale = oldPriceDb != null && saleDatesValid;
    console.log(
      `  [${p.id}] "${p.title}": price=${priceA}, oldPrice=${fmt(oldPriceDb)}, manualSaleActive=${isManualSale}`,
    );
  }

  console.log('\n═'.repeat(72));
  console.log('Rapor tamamlandı.');
  console.log('═'.repeat(72));
}

main()
  .catch((e) => {
    console.error('Hata:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
