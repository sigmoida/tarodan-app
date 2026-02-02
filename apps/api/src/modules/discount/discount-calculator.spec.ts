import { Test, TestingModule } from '@nestjs/testing';
import { DiscountCalculator } from './discount-calculator';
import { PrismaService } from '../../prisma';
import { DiscountType, DiscountScope, ProductStatus } from '@prisma/client';

describe('DiscountCalculator', () => {
  let calculator: DiscountCalculator;
  let prismaService: PrismaService;

  const mockPrismaService = {
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    discount: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    discountUsage: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscountCalculator,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    calculator = module.get<DiscountCalculator>(DiscountCalculator);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(calculator).toBeDefined();
  });

  describe('calculateCartTotal', () => {
    const mockProduct = {
      id: 'product-1',
      title: 'Test Product',
      price: 100,
      oldPrice: null,
      saleStartDate: null,
      saleEndDate: null,
      sellerId: 'seller-1',
      categoryId: 'cat-1',
      status: ProductStatus.active,
      seller: { id: 'seller-1', displayName: 'Test Seller' },
      category: { id: 'cat-1', name: 'Test Category' },
    };

    it('should calculate cart total without discounts', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([mockProduct]);
      mockPrismaService.discount.findMany.mockResolvedValue([]);

      const result = await calculator.calculateCartTotal({
        items: [{ productId: 'product-1', quantity: 2 }],
        userId: 'user-1',
      });

      expect(result.subtotal).toBe(200);
      expect(result.totalDiscount).toBe(0);
      expect(result.productDiscountTotal).toBe(0);
      expect(result.itemCount).toBe(2);
    });

    it('should apply product sale price', async () => {
      const productWithSale = {
        ...mockProduct,
        price: 80,
        oldPrice: 100,
        saleStartDate: new Date(Date.now() - 86400000),
        saleEndDate: new Date(Date.now() + 86400000),
      };

      mockPrismaService.product.findMany.mockResolvedValue([productWithSale]);
      mockPrismaService.discount.findMany.mockResolvedValue([]);

      const result = await calculator.calculateCartTotal({
        items: [{ productId: 'product-1', quantity: 1 }],
        userId: 'user-1',
      });

      expect(result.subtotal).toBe(80);
      expect(result.productDiscountTotal).toBe(20);
      expect(result.items[0].salePrice).toBe(80);
      expect(result.items[0].originalPrice).toBe(100);
    });

    it('should not apply expired sale price', async () => {
      const productWithExpiredSale = {
        ...mockProduct,
        price: 100,
        oldPrice: null,
        saleStartDate: new Date(Date.now() - 172800000),
        saleEndDate: new Date(Date.now() - 86400000), // Expired = restored to normal price
      };

      mockPrismaService.product.findMany.mockResolvedValue([productWithExpiredSale]);
      mockPrismaService.discount.findMany.mockResolvedValue([]);

      const result = await calculator.calculateCartTotal({
        items: [{ productId: 'product-1', quantity: 1 }],
        userId: 'user-1',
      });

      expect(result.subtotal).toBe(100);
      expect(result.productDiscountTotal).toBe(0);
      expect(result.items[0].salePrice).toBeNull();
    });

    it('should apply coupon discount', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'TESTCODE',
        name: 'Test Coupon',
        type: DiscountType.percentage,
        value: 10,
        scope: DiscountScope.global,
        sellerId: null,
        categoryId: null,
        targetProductIds: [],
        minCartValue: null,
        maxDiscountAmount: null,
        usageLimitTotal: null,
        usageLimitPerUser: 1,
        usedCount: 0,
        isActive: true,
        isStackable: false,
        priority: 0,
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000),
      };

      mockPrismaService.product.findMany.mockResolvedValue([mockProduct]);
      mockPrismaService.discount.findUnique.mockResolvedValue(mockCoupon);
      mockPrismaService.discount.findMany.mockResolvedValue([]);
      mockPrismaService.discountUsage.count.mockResolvedValue(0);

      const result = await calculator.calculateCartTotal({
        items: [{ productId: 'product-1', quantity: 1 }],
        couponCode: 'TESTCODE',
        userId: 'user-1',
      });

      expect(result.couponDiscountTotal).toBe(10); // 10% of 100
      expect(result.appliedDiscounts).toHaveLength(1);
      expect(result.appliedDiscounts[0].discountCode).toBe('TESTCODE');
    });

    it('should apply platform auto campaigns', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        code: null,
        name: 'Auto Campaign',
        type: DiscountType.fixed_amount,
        value: 15,
        scope: DiscountScope.global,
        sellerId: null,
        categoryId: null,
        targetProductIds: [],
        minCartValue: null,
        maxDiscountAmount: null,
        usageLimitTotal: null,
        usageLimitPerUser: null,
        usedCount: 0,
        isActive: true,
        isStackable: false,
        priority: 0,
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000),
      };

      mockPrismaService.product.findMany.mockResolvedValue([mockProduct]);
      mockPrismaService.discount.findMany.mockResolvedValue([mockCampaign]);

      const result = await calculator.calculateCartTotal({
        items: [{ productId: 'product-1', quantity: 1 }],
        userId: 'user-1',
      });

      expect(result.campaignDiscountTotal).toBe(15);
    });

    it('should apply max discount cap (50%)', async () => {
      // Product costs 100, coupon gives 60% discount = 60
      // Max should be capped at 50% = 50
      const bigCoupon = {
        id: 'coupon-1',
        code: 'BIGCODE',
        name: 'Big Coupon',
        type: DiscountType.percentage,
        value: 60,
        scope: DiscountScope.global,
        sellerId: null,
        categoryId: null,
        targetProductIds: [],
        minCartValue: null,
        maxDiscountAmount: null,
        usageLimitTotal: null,
        usageLimitPerUser: 1,
        usedCount: 0,
        isActive: true,
        isStackable: false,
        priority: 0,
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000),
      };

      mockPrismaService.product.findMany.mockResolvedValue([mockProduct]);
      mockPrismaService.discount.findUnique.mockResolvedValue(bigCoupon);
      mockPrismaService.discount.findMany.mockResolvedValue([]);
      mockPrismaService.discountUsage.count.mockResolvedValue(0);

      const result = await calculator.calculateCartTotal({
        items: [{ productId: 'product-1', quantity: 1 }],
        couponCode: 'BIGCODE',
        userId: 'user-1',
      });

      expect(result.totalDiscount).toBe(50); // Capped at 50%
      expect(result.warnings).toContain('Maksimum indirim limitine ulaşıldı (%50)');
    });

    it('should calculate free shipping for orders >= 500 TL', async () => {
      const expensiveProduct = { ...mockProduct, price: 500 };
      mockPrismaService.product.findMany.mockResolvedValue([expensiveProduct]);
      mockPrismaService.discount.findMany.mockResolvedValue([]);

      const result = await calculator.calculateCartTotal({
        items: [{ productId: 'product-1', quantity: 1 }],
        userId: 'user-1',
      });

      expect(result.shippingCost).toBe(0);
      expect(result.amountToFreeShipping).toBe(0);
    });

    it('should add shipping cost for orders < 500 TL', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([mockProduct]);
      mockPrismaService.discount.findMany.mockResolvedValue([]);

      const result = await calculator.calculateCartTotal({
        items: [{ productId: 'product-1', quantity: 1 }],
        userId: 'user-1',
      });

      expect(result.shippingCost).toBe(29.99);
      expect(result.amountToFreeShipping).toBe(400);
    });

    it('should mark unavailable products', async () => {
      const unavailableProduct = { ...mockProduct, status: ProductStatus.sold };
      mockPrismaService.product.findMany.mockResolvedValue([unavailableProduct]);
      mockPrismaService.discount.findMany.mockResolvedValue([]);

      const result = await calculator.calculateCartTotal({
        items: [{ productId: 'product-1', quantity: 1 }],
        userId: 'user-1',
      });

      expect(result.items[0].isAvailable).toBe(false);
      expect(result.warnings).toContain('"Test Product" artık satışta değil');
    });

    it('should return empty result for empty cart', async () => {
      const result = await calculator.calculateCartTotal({
        items: [],
        userId: 'user-1',
      });

      expect(result.subtotal).toBe(0);
      expect(result.itemCount).toBe(0);
      expect(result.grandTotal).toBe(0);
    });
  });

  describe('getProductEffectivePrice', () => {
    it('should return effective price for product on sale (A + oldPrice)', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue({
        id: 'product-1',
        price: 80,
        oldPrice: 100,
        saleStartDate: new Date(Date.now() - 86400000),
        saleEndDate: new Date(Date.now() + 86400000),
      });

      const result = await calculator.getProductEffectivePrice('product-1');

      expect(result.originalPrice).toBe(100);
      expect(result.effectivePrice).toBe(80);
      expect(result.salePrice).toBe(80);
      expect(result.isOnSale).toBe(true);
      expect(result.discountPercent).toBe(20);
    });

    it('should return original price when no sale', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue({
        id: 'product-1',
        price: 100,
        oldPrice: null,
        saleStartDate: null,
        saleEndDate: null,
      });

      const result = await calculator.getProductEffectivePrice('product-1');

      expect(result.originalPrice).toBe(100);
      expect(result.effectivePrice).toBe(100);
      expect(result.salePrice).toBeNull();
      expect(result.isOnSale).toBe(false);
      expect(result.discountPercent).toBeNull();
    });
  });
});
