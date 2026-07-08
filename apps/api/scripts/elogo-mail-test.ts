/**
 * oguztemelli@gmail.com'a GERÇEK e-Arşiv faturası keser → PDF'i eLogo'dan çeker →
 * S3'e kaydeder → KENDİ SMTP'mizden (smtp.gmail.com) PDF ekli mail GÖNDERİR.
 * node --env-file=.env -r ts-node/register/transpile-only scripts/elogo-mail-test.ts
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
  // 1) Alıcı kullanıcı + adres
  const user = await prisma.user.upsert({
    where: { email: TO },
    create: { email: TO, displayName: 'Oğuz Temelli' },
    update: {},
    select: { id: true },
  });
  const hasAddr = await prisma.address.findFirst({ where: { userId: user.id }, select: { id: true } });
  if (!hasAddr) {
    await prisma.address.create({
      data: { userId: user.id, fullName: 'Oğuz Temelli', phone: '05000000000', city: 'İstanbul', district: 'Kadıköy', address: 'Test Mah. No:1', isDefault: true },
    });
  }

  // 2) Üyelik + ödeme (throwaway)
  const tier = await prisma.membershipTier.findFirst({ select: { id: true } });
  const membership = await prisma.userMembership.upsert({
    where: { userId: user.id },
    create: { userId: user.id, tierId: tier!.id, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5) },
    update: {},
    select: { id: true },
  });
  const mp = await prisma.membershipPayment.create({
    data: { membershipId: membership.id, amount: 149.99, provider: 'test-elogo', providerPaymentId: `mail-${Date.now()}`, periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 864e5) },
  });

  // 3) Servisi storage + smtp ile wire et
  const smtp = new SmtpProvider(config);
  const storage = new StorageService(config, prisma as any);
  await storage.onModuleInit(); // script'te S3'ü hazırla (API'de Nest otomatik çağırır)
  const elogo = new ElogoService(new LiveElogoSoapClient(config), config);
  const svc = new ElogoInvoicingService(prisma as any, elogo, config, undefined as any, storage, smtp);

  console.log(`→ ${TO} için üyelik faturası kesiliyor + PDF çekilip maillenecek...\n`);
  await svc.issueMembershipInvoice(mp.id);

  // deliverPdf fire-and-forget olduğu için kısa bekle
  await new Promise((r) => setTimeout(r, 6000));

  const rec = await prisma.elogoInvoice.findUnique({ where: { type_sourceId: { type: 'membership' as any, sourceId: mp.id } } });
  console.log('📄 elogo_invoices:');
  console.log(`   status     = ${rec?.status}`);
  console.log(`   invoiceNo  = ${rec?.invoiceNumber}`);
  console.log(`   ettn       = ${rec?.ettn}`);
  console.log(`   pdfUrl(S3) = ${rec?.pdfUrl ?? '(yok)'}`);
  console.log(`   emailSent  = ${rec?.emailSentAt ? rec.emailSentAt.toISOString() + ' → ' + TO : '(gönderilmedi)'}`);
  console.log(`\n${rec?.emailSentAt ? '✅ MAIL GÖNDERİLDİ — Gmail gelen kutunu (ve spam) kontrol et.' : '⚠️ Mail gönderilemedi (log üstte).'}`);
}

main().catch((e) => { console.error('❌', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
