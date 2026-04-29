import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orderNumber = process.argv[2];
  if (!orderNumber) {
    console.error('Usage: tsx scripts/cleanup-stuck-refund.ts <ORD-...>');
    process.exit(1);
  }

  const order = await prisma.order.findFirst({
    where: { orderNumber },
    include: { refundRequests: true },
  });

  if (!order) {
    console.error(`Order ${orderNumber} not found`);
    process.exit(1);
  }

  console.log(`Order: ${order.orderNumber} (status=${order.status})`);
  console.log(`Refund requests: ${order.refundRequests.length}`);
  for (const rr of order.refundRequests) {
    console.log(`  - ${rr.refundNumber} status=${rr.status} createdAt=${rr.createdAt.toISOString()}`);
  }

  const stuck = order.refundRequests.filter(
    (rr) => rr.status === 'approved' && !rr.refundedAt,
  );
  if (stuck.length === 0) {
    console.log('No stuck refund requests to remove.');
    return;
  }

  for (const rr of stuck) {
    await prisma.refundRequest.delete({ where: { id: rr.id } });
    console.log(`Deleted stuck RefundRequest ${rr.refundNumber}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
