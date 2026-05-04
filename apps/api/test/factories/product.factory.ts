import { Prisma } from '@prisma/client';
import { getPrisma } from '../test-utils/db';

export interface CreatedTestProduct {
  id: string;
  sellerId: string;
  price: number;
  quantity: number | null;
}

export async function createProduct(opts: {
  sellerId: string;
  categoryId: string;
  brandId?: string;
  manufacturerId?: string;
  title?: string;
  price?: number;
  quantity?: number;
  condition?: 'new' | 'used' | 'refurbished';
  status?: 'pending' | 'active' | 'sold' | 'inactive';
  isTradeEnabled?: boolean;
}): Promise<CreatedTestProduct> {
  const prisma = getPrisma();
  const price = opts.price ?? 100;
  const quantity = opts.quantity ?? 1;

  const product = await prisma.product.create({
    data: {
      sellerId: opts.sellerId,
      categoryId: opts.categoryId,
      brandId: opts.brandId,
      manufacturerId: opts.manufacturerId,
      title: opts.title ?? `Test Product ${Date.now()}`,
      description: 'Auto-created for E2E tests',
      price: new Prisma.Decimal(price),
      condition: (opts.condition ?? 'new') as any,
      status: (opts.status ?? 'active') as any,
      isTradeEnabled: opts.isTradeEnabled ?? false,
      quantity,
      reservedQuantity: 0,
    },
  });

  return {
    id: product.id,
    sellerId: product.sellerId,
    price,
    quantity: product.quantity,
  };
}
