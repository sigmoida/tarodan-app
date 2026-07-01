/**
 * Tamamlanmış bir sipariş için Tarodan gelir e-Arşivlerini canlı servis üzerinden tetikler
 * (completeOrder'ın yaptığının aynısı): komisyon → satıcı, hizmet bedeli → alıcı.
 * Boru hattını kanıtlar + gerçek PDF ekli mail gönderir.
 * node --env-file=.env -r ts-node/register/transpile-only scripts/elogo-trigger-order.ts <orderId>
 */
import { PrismaClient } from '@prisma/client';
import { LiveElogoSoapClient } from '../src/modules/elogo/elogo-soap.client';
import { ElogoService } from '../src/modules/elogo/elogo.service';
import { ElogoInvoicingService } from '../src/modules/elogo/elogo-invoicing.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { SmtpProvider } from '../src/modules/notification/providers/smtp.provider';

const prisma = new PrismaClient();
const config = { get: (k: string, d?: any) => process.env[k] ?? d } as any;

async function main() {
  // Son completed sipariş (arg verilmezse)
  const orderId =
    process.argv[2] ||
    (await prisma.order.findFirst({ where: { status: 'completed' as any }, orderBy: { updatedAt: 'desc' }, select: { id: true } }))?.id;
  if (!orderId) throw new Error('completed sipariş bulunamadı');

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { buyer: { select: { email: true } }, seller: { select: { email: true, sellerType: true } } },
  });
  const ledger = await prisma.commissionLedger.findUnique({ where: { orderId } });
  console.log('=== SİPARİŞ ===', orderId);
  console.log('status        :', order?.status);
  console.log('satıcı        :', order?.seller?.email, '(', order?.seller?.sellerType, ')');
  console.log('alıcı         :', order?.buyer?.email);
  console.log('ledger        :', ledger ? `sellerCommission=${(ledger as any).sellerCommission} buyerFee=${(ledger as any).buyerFee}` : 'YOK');
  console.log('');

  // Servisi storage + smtp ile wire et (Nest'in canlıda yaptığı gibi)
  const smtp = new SmtpProvider(config);
  const storage = new StorageService(config, prisma as any);
  await storage.onModuleInit();
  const elogo = new ElogoService(new LiveElogoSoapClient(config), config);
  const svc = new ElogoInvoicingService(prisma as any, elogo, config, storage, smtp);

  console.log('→ issueCommissionInvoice + issueServiceFeeInvoice + issuePlatformSaleInvoice tetikleniyor...\n');
  await svc.issueCommissionInvoice(orderId);
  await svc.issueServiceFeeInvoice(orderId);
  await svc.issuePlatformSaleInvoice(orderId);

  // deliverPdf fire-and-forget → bekle
  await new Promise((r) => setTimeout(r, 8000));

  const invs = await prisma.elogoInvoice.findMany({ where: { sourceId: orderId } });
  console.log('=== SONUÇ ===');
  if (!invs.length) console.log('  ⚠️ Hiç fatura kesilmedi (ledger 0/null veya platform self).');
  for (const i of invs) {
    console.log(
      `  ${i.type.padEnd(14)} ${String(i.status).padEnd(9)} no=${i.invoiceNumber} ` +
        `pdf=${i.pdfUrl ? 'S3✓' : '✗'} mail=${i.emailSentAt ? '✓ ' + i.emailSentAt.toISOString() : '✗'}`,
    );
    if (i.elogoResultMsg && i.elogoResultMsg !== 'Başarılı') console.log(`     ↳ ${i.elogoResultMsg}`);
  }
}
main().catch((e) => { console.error('❌', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
