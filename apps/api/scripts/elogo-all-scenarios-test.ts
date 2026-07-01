/**
 * TÜM gelir senaryolarını GERÇEK DB + demo eLogo'ya karşı keser:
 * komisyon, hizmet bedeli, üyelik, boost, takas komisyonu. Minimal throwaway fixture üretir.
 * Demo ortamı → gerçek maliyet yok. node --env-file=.env -r ts-node/register/transpile-only scripts/elogo-all-scenarios-test.ts
 */
import { PrismaClient } from '@prisma/client';
import { LiveElogoSoapClient } from '../src/modules/elogo/elogo-soap.client';
import { ElogoService } from '../src/modules/elogo/elogo.service';
import { ElogoInvoicingService } from '../src/modules/elogo/elogo-invoicing.service';

const prisma = new PrismaClient();
const config = { get: (k: string, d?: any) => process.env[k] ?? d } as any;
const elogo = new ElogoService(new LiveElogoSoapClient(config), config);
const svc = new ElogoInvoicingService(prisma as any, elogo, config);
const stamp = Date.now();

async function nameOf(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true } });
  return `${u?.displayName} <${u?.email}>`;
}

async function main() {
  const created: Array<{ type: string; sourceId: string }> = [];

  // 1) KOMİSYON + HİZMET BEDELİ (mevcut sipariş + throwaway ledger)
  const order = await prisma.order.findFirst({ select: { id: true, sellerId: true, buyerId: true } });
  if (order) {
    await prisma.commissionLedger.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, sellerCommission: 30, buyerFee: 12, totalPlatformRevenue: 42, status: 'earned' },
      update: { sellerCommission: 30, buyerFee: 12, totalPlatformRevenue: 42, status: 'earned' },
    });
    console.log(`\n[1] KOMİSYON → satıcı ${await nameOf(order.sellerId)} (30 TL)`);
    await svc.issueCommissionInvoice(order.id);
    created.push({ type: 'commission', sourceId: order.id });
    console.log(`    HİZMET BEDELİ → alıcı ${await nameOf(order.buyerId)} (12 TL)`);
    await svc.issueServiceFeeInvoice(order.id);
    created.push({ type: 'service_fee', sourceId: order.id });
  }

  // 2) ÜYELİK (mevcut membership + throwaway payment)
  const membership = await prisma.userMembership.findFirst({ select: { id: true, userId: true } });
  if (membership) {
    const mp = await prisma.membershipPayment.create({
      data: {
        membershipId: membership.id, amount: 149.99, provider: 'test-elogo',
        providerPaymentId: `ms-${stamp}`, periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 864e5),
      },
    });
    console.log(`\n[2] ÜYELİK → üye ${await nameOf(membership.userId)} (149.99 TL)`);
    await svc.issueMembershipInvoice(mp.id);
    created.push({ type: 'membership', sourceId: mp.id });
  }

  // 3) BOOST (mevcut ürün + throwaway boost)
  const product = await prisma.product.findFirst({ select: { id: true, sellerId: true } });
  if (product) {
    const boost = await prisma.productBoost.create({
      data: { productId: product.id, userId: product.sellerId, durationDays: 7, price: 59.99, status: 'active' },
    });
    console.log(`\n[3] BOOST → satıcı ${await nameOf(product.sellerId)} (59.99 TL)`);
    await svc.issueBoostInvoice(boost.id);
    created.push({ type: 'boost', sourceId: boost.id });
  }

  // 4) TAKAS KOMİSYONU (tcp'siz bir trade + throwaway tcp)
  const trade = await prisma.trade.findFirst({
    where: { cashPayment: { is: null } },
    select: { id: true, initiatorId: true, receiverId: true },
  });
  if (trade) {
    const tcp = await prisma.tradeCashPayment.create({
      data: {
        tradeId: trade.id, payerId: trade.initiatorId, recipientId: trade.receiverId,
        amount: 200, commission: 24, totalAmount: 224, provider: 'test-elogo', status: 'completed',
      },
    });
    console.log(`\n[4] TAKAS KOMİSYONU → ödeyen ${await nameOf(trade.initiatorId)} (24 TL)`);
    await svc.issueTradeCashCommissionInvoice(tcp.id);
    created.push({ type: 'trade_commission', sourceId: tcp.id });
  }

  // SONUÇ TABLOSU
  console.log('\n──────────── SONUÇ (elogo_invoices) ────────────');
  for (const c of created) {
    const r = await prisma.elogoInvoice.findUnique({ where: { type_sourceId: { type: c.type as any, sourceId: c.sourceId } } });
    const ok = r && (r.status === 'sent' || r.status === 'signed');
    console.log(
      `${ok ? '✅' : '❌'} ${c.type.padEnd(16)} | ${r?.status?.padEnd(7)} | ${r?.invoiceNumber} | net ${r?.netAmount} +KDV ${r?.taxAmount} = ${r?.total} | ref ${r?.elogoRefId ?? '-'} | ${r?.elogoResultMsg ?? ''}`,
    );
  }
}

main()
  .catch((e) => { console.error('❌ HATA:', e?.message || e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
