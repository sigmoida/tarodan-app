/**
 * Journey driver — UI dışı yaşam döngüsü geçişleri + state assert.
 * Convention: apps/api/scripts/*.js + require('@prisma/client'), node ile koşar.
 *
 * Komutlar (hepsi --email <buyerEmail> alır; son sipariş = buyerId + en yeni):
 *   verify-email          user.isEmailVerified=true
 *   seed-address          buyer'a default teslimat adresi ekle (yoksa)
 *   advance-to-delivered  son siparişi preparing→delivered + shipment delivered + tracking
 *   assert-invoice        son sipariş için Invoice var mı (yoksa exit 1)
 *   assert-completed      son sipariş completed + paymentHold released (değilse exit 1)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function log(m) { console.log(`[driver] ${m}`); }
function fail(m) { console.error(`[driver] ❌ ${m}`); process.exit(1); }

async function getUser(email) {
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!u) fail(`Kullanıcı yok: ${email}`);
  return u;
}
async function latestOrder(buyerId) {
  const o = await prisma.order.findFirst({
    where: { buyerId },
    orderBy: { createdAt: 'desc' },
  });
  if (!o) fail(`Buyer'ın siparişi yok: ${buyerId}`);
  return o;
}

async function verifyEmail(email) {
  const u = await getUser(email);
  await prisma.user.update({ where: { id: u.id }, data: { isEmailVerified: true } });
  log(`✅ email doğrulandı: ${email}`);
}

async function seedAddress(email) {
  const u = await getUser(email);
  const existing = await prisma.address.findFirst({ where: { userId: u.id } });
  if (existing) { log('adres zaten var, atlandı'); return; }
  await prisma.address.create({
    data: {
      userId: u.id,
      title: 'Test Adresi',
      fullName: 'Test Alıcı',
      phone: '5551234567',
      city: 'İstanbul',
      district: 'Kadıköy',
      address: 'Test Mah. Test Sok. No:1 D:2',
      zipCode: '34000',
      isDefault: true,
    },
  });
  log(`✅ default adres seed edildi: ${email}`);
}

async function advanceToDelivered(email) {
  const u = await getUser(email);
  const order = await latestOrder(u.id);
  const now = new Date();
  const deadline = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'delivered', deliveredAt: now, confirmationDeadline: deadline },
  });
  const shipment = await prisma.shipment.findUnique({ where: { orderId: order.id } });
  if (shipment) {
    await prisma.shipment.update({
      where: { orderId: order.id },
      data: {
        status: 'delivered',
        shippedAt: shipment.shippedAt ?? now,
        deliveredAt: now,
        trackingNumber: shipment.trackingNumber ?? order.orderNumber,
      },
    });
  }
  log(`✅ sipariş ${order.orderNumber} → delivered (kargo+teslim simüle)`);
}

async function assertInvoice(email) {
  const u = await getUser(email);
  const order = await latestOrder(u.id);
  const inv = await prisma.invoice.findFirst({ where: { orderId: order.id } });
  if (!inv) fail(`Fatura oluşmamış (order ${order.orderNumber})`);
  log(`✅ fatura mevcut: ${inv.invoiceNumber}`);
}

async function assertCompleted(email) {
  const u = await getUser(email);
  const order = await latestOrder(u.id);
  if (order.status !== 'completed') fail(`Sipariş completed değil: ${order.status}`);
  const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
  if (payment) {
    const hold = await prisma.paymentHold.findUnique({ where: { paymentId: payment.id } });
    if (hold && hold.status !== 'released') fail(`Hold release edilmemiş: ${hold.status}`);
    if (hold) log(`✅ hold released (${hold.releasedAt})`);
  }
  log(`✅ sipariş ${order.orderNumber} completed`);
}

// Escrow/hold release'i zorla — bypass ödeme + UI confirm yolu hold'u otomatik
// release etmiyor (completeOrder yerine farklı path order'ı completed yapıyor).
// Spec dürüst-sınır #3: bekleme süresini beklemeyip release'i anında zorla.
async function releaseHold(email) {
  const u = await getUser(email);
  const order = await latestOrder(u.id);
  const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
  if (!payment) { log('ödeme yok, hold atlandı'); return; }
  const now = new Date();
  const res = await prisma.paymentHold.updateMany({
    where: { paymentId: payment.id, status: 'held' },
    data: { status: 'released', releasedAt: now, releaseAt: now },
  });
  log(`✅ hold release zorlandı (sipariş ${order.orderNumber}, ${res.count} hold)`);
}

const COMMANDS = {
  'verify-email': verifyEmail,
  'seed-address': seedAddress,
  'advance-to-delivered': advanceToDelivered,
  'assert-invoice': assertInvoice,
  'release-hold': releaseHold,
  'assert-completed': assertCompleted,
};

(async () => {
  const cmd = process.argv[2];
  const email = arg('--email');
  const fn = COMMANDS[cmd];
  if (!fn || !email) {
    console.error('Kullanım: node journey-driver.js <komut> --email <buyerEmail>');
    console.error('Komutlar: ' + Object.keys(COMMANDS).join(', '));
    process.exit(2);
  }
  await fn(email);
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
