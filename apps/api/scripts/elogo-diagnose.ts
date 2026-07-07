/**
 * Teşhis: son e-Arşiv kayıtları + son tamamlanan siparişlerde fatura durumu.
 * node --env-file=.env -r ts-node/register/transpile-only scripts/elogo-diagnose.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== ENV ===');
  console.log('ELOGO_ENABLED      :', process.env.ELOGO_ENABLED);
  console.log('ELOGO_SOAP_MODE    :', process.env.ELOGO_SOAP_MODE);
  console.log('ELOGO_COMPANY_VKN  :', process.env.ELOGO_COMPANY_VKN);
  console.log('SMTP_HOST/USER     :', process.env.SMTP_HOST, '/', process.env.SMTP_USER);
  console.log('AWS_S3_BUCKET      :', process.env.AWS_S3_BUCKET || process.env.S3_BUCKET);
  console.log('');

  console.log('=== SON 10 e-ARŞİV KAYDI (ElogoInvoice) ===');
  const invs = await prisma.elogoInvoice.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      type: true,
      status: true,
      sourceId: true,
      invoiceNumber: true,
      recipientName: true,
      recipientUserId: true,
      total: true,
      emailSentAt: true,
      pdfUrl: true,
      elogoResultMsg: true,
      attemptCount: true,
      createdAt: true,
    },
  });
  if (invs.length === 0) {
    console.log('  ⚠️  HİÇ kayıt yok → issue* HİÇ çağrılmamış (API yeni kodla restart edilmemiş olabilir).');
  }
  for (const i of invs) {
    console.log(
      `  [${i.createdAt.toISOString().slice(0, 19)}] ${i.type.padEnd(14)} ${String(i.status).padEnd(9)} no=${i.invoiceNumber ?? '-'} ` +
        `mail=${i.emailSentAt ? '✓' : '✗'} pdf=${i.pdfUrl ? '✓' : '✗'} attempt=${i.attemptCount} alıcı=${i.recipientName ?? '-'}`,
    );
    if (i.status === 'failed' || i.elogoResultMsg) console.log(`        ↳ ${i.elogoResultMsg ?? ''}`);
  }
  console.log('');

  console.log('=== SON 8 SİPARİŞ (her durum) + faturası var mı ===');
  const orders = await prisma.order.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 8,
    select: {
      id: true,
      status: true,
      totalAmount: true,
      buyerId: true,
      sellerId: true,
      updatedAt: true,
    },
  });
  for (const o of orders) {
    const related = await prisma.elogoInvoice.findMany({
      where: { sourceId: o.id },
      select: { type: true, status: true, recipientUserId: true, emailSentAt: true },
    });
    const seller = await prisma.user.findUnique({ where: { id: o.sellerId }, select: { email: true, sellerType: true } });
    console.log(
      `  order ${o.id.slice(0, 8)} [${o.status}] ${o.totalAmount}₺ satıcı=${seller?.sellerType ?? '?'} → ` +
        (related.length
          ? related.map((r) => `${r.type}:${r.status}(mail ${r.emailSentAt ? '✓' : '✗'})`).join(', ')
          : '⚠️ FATURA YOK'),
    );
  }
}

main()
  .catch((e) => {
    console.error('HATA:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
