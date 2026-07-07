/**
 * ElogoInvoicingService'i GERÇEK DB + demo eLogo ile doğrudan test eder (ödeme/PayTR'a gerek YOK).
 * Mevcut bir UserMembership için throwaway MembershipPayment oluşturur, issueMembershipInvoice çağırır,
 * elogo_invoices kaydını yazdırır. Demo ortamı → gerçek maliyet yok.
 *
 * Kullanım: node --env-file=.env -r ts-node/register/transpile-only scripts/elogo-invoice-test.ts
 */
import { PrismaClient } from '@prisma/client';
import { LiveElogoSoapClient } from '../src/modules/elogo/elogo-soap.client';
import { ElogoService } from '../src/modules/elogo/elogo.service';
import { ElogoInvoicingService } from '../src/modules/elogo/elogo-invoicing.service';

const prisma = new PrismaClient();
const config = { get: (k: string, d?: any) => process.env[k] ?? d } as any;

async function main() {
  console.log(`ELOGO_ENABLED=${process.env.ELOGO_ENABLED}  MODE=${process.env.ELOGO_SOAP_MODE}  URL=${process.env.ELOGO_SOAP_URL}`);

  const membership = await prisma.userMembership.findFirst({ select: { id: true, userId: true } });
  if (!membership) throw new Error('UserMembership yok — önce seed çalıştır.');
  const user = await prisma.user.findUnique({
    where: { id: membership.userId },
    select: { email: true, displayName: true, taxId: true },
  });
  console.log(`→ Alıcı (üye): ${user?.displayName} <${user?.email}> taxId=${user?.taxId ?? '(yok→11111111111)'}`);

  const now = new Date();
  const mp = await prisma.membershipPayment.create({
    data: {
      membershipId: membership.id,
      amount: 99.99,
      provider: 'test-elogo',
      providerPaymentId: `elogo-test-${now.getTime()}`,
      periodStart: now,
      periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  console.log(`→ Test MembershipPayment: ${mp.id} (99.99 TL)\n`);

  const elogo = new ElogoService(new LiveElogoSoapClient(config), config);
  const invoicing = new ElogoInvoicingService(prisma as any, elogo, config);

  console.log('→ issueMembershipInvoice çağrılıyor...\n');
  await invoicing.issueMembershipInvoice(mp.id);

  const rec = await prisma.elogoInvoice.findUnique({
    where: { type_sourceId: { type: 'membership' as any, sourceId: mp.id } },
  });
  if (!rec) {
    console.log('❌ elogo_invoices kaydı OLUŞMADI (eLogo kapalı veya tutar 0 olabilir).');
  } else {
    console.log('📄 elogo_invoices kaydı:');
    console.log(`   status        = ${rec.status}`);
    console.log(`   documentType  = ${rec.documentType}`);
    console.log(`   invoiceNumber = ${rec.invoiceNumber}`);
    console.log(`   ettn          = ${rec.ettn}`);
    console.log(`   net/KDV/total = ${rec.netAmount} / ${rec.taxAmount} / ${rec.total}`);
    console.log(`   elogoRefId    = ${rec.elogoRefId}`);
    console.log(`   resultCode    = ${rec.elogoResultCode}`);
    console.log(`   resultMsg     = ${rec.elogoResultMsg}`);
    console.log(`\n${rec.status === 'sent' || rec.status === 'signed' ? '✅ FATURA KESİLDİ' : '⚠️ KESİLEMEDİ — resultMsg yukarıda'}`);
    if (rec.ettn) console.log(`\nPDF için: ELOGO_PDF_UUID=${rec.ettn} ELOGO_PDF_OUT=/tmp/fatura.pdf node --env-file=.env scripts/elogo-fetch-pdf.mjs`);
  }
}

main()
  .catch((e) => {
    console.error('❌ HATA:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
