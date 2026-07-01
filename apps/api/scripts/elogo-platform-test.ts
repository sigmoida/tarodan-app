/**
 * Tamamlanmış bir PLATFORM satışının ürün e-Arşivini keser; alıcıyı oguztemelli@gmail.com
 * yapar ki mail SANA düşsün (demo'da diğer alıcılar sahte adres). PDF→S3→mail dahil.
 * node --env-file=.env -r ts-node/register/transpile-only scripts/elogo-platform-test.ts
 */
import { PrismaClient } from '@prisma/client';
import { LiveElogoSoapClient } from '../src/modules/elogo/elogo-soap.client';
import { ElogoService } from '../src/modules/elogo/elogo.service';
import { ElogoInvoicingService } from '../src/modules/elogo/elogo-invoicing.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { SmtpProvider } from '../src/modules/notification/providers/smtp.provider';

const prisma = new PrismaClient();
const config = { get: (k: string, d?: any) => process.env[k] ?? d } as any;
const TO = 'oguztemelli@gmail.com';

async function main() {
  // Platform satıcılı tamamlanmış sipariş
  const platformSellers = await prisma.user.findMany({ where: { sellerType: 'platform' }, select: { id: true } });
  const order = await prisma.order.findFirst({
    where: { sellerId: { in: platformSellers.map((u) => u.id) }, status: 'completed' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, totalAmount: true, buyerId: true },
  });
  if (!order) throw new Error('Tamamlanmış platform siparişi yok.');
  const buyerUser = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { email: true } });
  console.log(`(alıcı DEĞİŞTİRİLMEDİ — gerçek alıcı: ${buyerUser?.email})`);
  // varsa eski platform_sale kaydını sil (yeniden kesilip mail gitsin)
  await prisma.elogoInvoice.deleteMany({ where: { type: 'platform_sale' as any, sourceId: order.id } });

  const smtp = new SmtpProvider(config);
  const storage = new StorageService(config, prisma as any);
  await storage.onModuleInit();
  const elogo = new ElogoService(new LiveElogoSoapClient(config), config);
  const svc = new ElogoInvoicingService(prisma as any, elogo, config, storage, smtp);

  console.log(`→ Platform satışı ${order.id.slice(0, 8)} (${order.totalAmount} TL) → alıcı ${TO}\n`);
  await svc.issuePlatformSaleInvoice(order.id);
  await new Promise((r) => setTimeout(r, 7000));

  const rec = await prisma.elogoInvoice.findUnique({ where: { type_sourceId: { type: 'platform_sale' as any, sourceId: order.id } } });
  console.log('📄 platform_sale e-Arşivi:');
  console.log(`   status    = ${rec?.status}`);
  console.log(`   invoiceNo = ${rec?.invoiceNumber}`);
  console.log(`   tutar     = net ${rec?.netAmount} +KDV ${rec?.taxAmount} = ${rec?.total}`);
  console.log(`   pdfUrl    = ${rec?.pdfUrl ?? '(yok)'}`);
  console.log(`   emailSent = ${rec?.emailSentAt ? rec.emailSentAt.toISOString() + ' → ' + TO : '(yok)'}`);
  console.log(`\n${rec?.emailSentAt ? '✅ MAIL ' + TO + ' ADRESİNE GÖNDERİLDİ — Gmail (ve spam) kontrol et.' : '⚠️ Mail gönderilemedi'}`);
}

main().catch((e) => { console.error('❌', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
