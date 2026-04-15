/**
 * TEMP: İki alıcı aynı anda Buy Now atar — FOR UPDATE sonrası biri başarılı,
 * diğeri stok hatası vermeli; reserved_quantity quantity'yi aşmamalı.
 *
 * Önkoşullar:
 * - API ayakta (örn. pnpm dev)
 * - Ürün: status=active, quantity=1, reserved_quantity=0, iki alıcı da satıcı değil
 * - İki farklı kullanıcı JWT (satıcı dışı)
 *
 * Kullanım (apps/api dizininden):
 *   Login yanıtındaki `tokens.accessToken` değerlerini kullan (düz `accessToken` alanı yok).
 *   JWT_BUYER_A=... JWT_BUYER_B=... PRODUCT_ID=... pnpm exec ts-node -r tsconfig-paths/register scripts/temp-concurrent-buy-now.ts
 *
 * İsteğe bağlı:
 *   API_BASE=http://localhost:4000/api  (varsayılan: http://localhost:3000/api)
 *   DATABASE_URL ayarlıysa script bitince ürün satırını konsola yazar.
 */
import { PrismaClient } from '@prisma/client';

const API_BASE = (process.env.API_BASE || 'http://localhost:3000/api').replace(/\/$/, '');
const PRODUCT_ID = process.env.PRODUCT_ID || '';
const JWT_A = process.env.JWT_BUYER_A || '';
const JWT_B = process.env.JWT_BUYER_B || '';

const inlineAddress = (label: string) => ({
  fullName: `Concurrent Test ${label}`,
  phone: '5550000000',
  city: 'Istanbul',
  district: 'Kadikoy',
  address: `Temp concurrent buy test ${label} ${Date.now()}`,
});

async function buyNow(token: string, label: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}/orders/buy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      productId: PRODUCT_ID,
      shippingAddress: inlineAddress(label),
    }),
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { status: res.status, body };
}

async function main() {
  if (!PRODUCT_ID || !JWT_A || !JWT_B) {
    console.error(
      'Eksik env: PRODUCT_ID, JWT_BUYER_A, JWT_BUYER_B gerekli.\n' +
        'Örnek:\n' +
        '  JWT_BUYER_A=eyJ... JWT_BUYER_B=eyJ... PRODUCT_ID=uuid... pnpm exec ts-node -r tsconfig-paths/register scripts/temp-concurrent-buy-now.ts',
    );
    process.exit(1);
  }

  console.log(`POST ${API_BASE}/orders/buy (2x paralel) productId=${PRODUCT_ID}\n`);

  const [ra, rb] = await Promise.all([
    buyNow(JWT_A, 'A'),
    buyNow(JWT_B, 'B'),
  ]);

  console.log('Buyer A:', ra.status, JSON.stringify(ra.body, null, 2));
  console.log('Buyer B:', rb.status, JSON.stringify(rb.body, null, 2));

  const success = [ra, rb].filter((r) => r.status >= 200 && r.status < 300);
  if (success.length === 2) {
    console.error('\n❌ Beklenmeyen: iki istek de 2xx — oversell riski (aynı stokta).');
    process.exit(1);
  }
  if (success.length === 1) {
    console.log('\n✅ Beklenen: tek başarılı sipariş, diğeri hata.');
  } else {
    console.warn('\n⚠️ İkisi de başarısız — token/ürün/adres veya stok önkoşullarını kontrol et.');
  }

  if (process.env.DATABASE_URL) {
    const prisma = new PrismaClient();
    try {
      const p = await prisma.product.findUnique({
        where: { id: PRODUCT_ID },
        select: {
          id: true,
          title: true,
          quantity: true,
          status: true,
        },
      });
      console.log('\nDB snapshot:', p);
      const q = p?.quantity;
      if (q != null && q < 0) {
        console.error(`❌ Oversell: quantity went negative (${q})`);
        process.exit(1);
      }
    } finally {
      await prisma.$disconnect();
    }
  } else {
    console.log('\n(DATABASE_URL yok — DB snapshot atlandı.)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
