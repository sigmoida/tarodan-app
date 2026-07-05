import { Test, TestingModule } from '@nestjs/testing';
import { CartService } from './cart.service';
import { PrismaService } from '../../prisma';
import { DiscountService } from '../discount/discount.service';
import { StorageService } from '../storage/storage.service';
import { ProductStatus } from '@prisma/client';

/**
 * addItem — "sepette zaten olan ürüne tekrar ekleme" davranışı.
 *
 * Regresyon: Tekil (quantity=1) ürünlerde ikinci "Sepete Ekle" eskiden
 * newQuantity=2 hesaplayıp "Bu üründen en fazla 1 adet sipariş verilebilir"
 * hatası fırlatıyordu. İptal sonrası kalan bayat sepet satırıyla birleşince
 * kullanıcı "tekrar sipariş veremiyorum" sanıyordu. Artık idempotent:
 * stok/limit üst sınırına sabitlenir, hata fırlatmaz.
 */
describe('CartService.addItem — idempotent re-add', () => {
  let service: CartService;

  const cartId = 'cart-1';
  const productId = 'prod-1';

  const mockPrisma: any = {
    product: { findUnique: jest.fn() },
    cartItem: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    cart: { update: jest.fn().mockResolvedValue({}) },
  };

  const makeProduct = (overrides: Record<string, unknown> = {}) => ({
    id: productId,
    title: 'Tekil Ürün',
    status: ProductStatus.active,
    sellerId: 'seller-1',
    quantity: 1,
    reservedQuantity: 0,
    maxQuantityPerOrder: null,
    images: [],
    seller: { id: 'seller-1', displayName: 'Satıcı' },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DiscountService, useValue: {} },
        { provide: StorageService, useValue: {} },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
    // getOrCreateCart / getOrCreate / extendCartExpiry servis-içi yardımcılar —
    // addItem'ın karar mantığını izole test etmek için spy'lanır.
    jest
      .spyOn(service as any, 'getOrCreateCart')
      .mockResolvedValue({ id: cartId });
    jest
      .spyOn(service as any, 'extendCartExpiry')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service, 'getOrCreate')
      .mockResolvedValue({ id: cartId } as any);
  });

  it('tekil ürün (quantity=1) zaten sepetteyken tekrar eklenince HATA FIRLATMAZ ve adet 1 kalır (no-op)', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(makeProduct());
    mockPrisma.cartItem.findUnique.mockResolvedValue({
      id: 'ci-1',
      cartId,
      productId,
      quantity: 1,
    });

    await expect(
      service.addItem('user-1', { productId, quantity: 1 } as any),
    ).resolves.toBeDefined();

    // Artış yok → cartItem.update çağrılmamalı (no-op).
    expect(mockPrisma.cartItem.update).not.toHaveBeenCalled();
  });

  it('çoklu-adet ürün (quantity=3, max=3): sepette 2 varken 1 daha eklenince 3 olur', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(
      makeProduct({ quantity: 3, maxQuantityPerOrder: 3 }),
    );
    mockPrisma.cartItem.findUnique.mockResolvedValue({
      id: 'ci-1',
      cartId,
      productId,
      quantity: 2,
    });

    await service.addItem('user-1', { productId, quantity: 1 } as any);

    expect(mockPrisma.cartItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 3 } }),
    );
  });

  it('çoklu-adet ürün limitte (quantity=3, sepette 3): tekrar eklenince HATA YOK, no-op', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(
      makeProduct({ quantity: 3, maxQuantityPerOrder: 3 }),
    );
    mockPrisma.cartItem.findUnique.mockResolvedValue({
      id: 'ci-1',
      cartId,
      productId,
      quantity: 3,
    });

    await expect(
      service.addItem('user-1', { productId, quantity: 1 } as any),
    ).resolves.toBeDefined();
    expect(mockPrisma.cartItem.update).not.toHaveBeenCalled();
  });
});
