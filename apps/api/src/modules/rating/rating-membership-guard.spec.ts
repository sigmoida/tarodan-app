import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RatingService } from './rating.service';

/**
 * Üyelik/dijital siparişler sipariş sistemi içinde sanal ürün + platform satıcısı
 * olarak modellenir ("MEM-" sipariş no). Bu siparişlere ürün/satıcı değerlendirmesi
 * yapılamaz — guard, ürün-tipine özgü diğer kontrollerden ÖNCE devreye girer.
 */
describe('RatingService — üyelik siparişi guard', () => {
  const moderationAi = { isEnabled: false } as any;

  const makeService = (order: any, user: any = { id: 'r1' }) => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    };
    return new RatingService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      moderationAi,
    );
  };

  describe('createProductRating', () => {
    it('"MEM-" siparişinde ürün değerlendirmesini reddeder', async () => {
      const service = makeService({
        id: 'o1',
        orderNumber: 'MEM-1781257318265-BENIPST9F',
        buyerId: 'b1',
        productId: 'p1',
        status: 'completed',
      });
      await expect(
        service.createProductRating('b1', {
          orderId: 'o1',
          productId: 'p1',
          score: 5,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('normal siparişte guard tetiklenmez → sahiplik doğrulamasına ilerler', async () => {
      const service = makeService({
        id: 'o1',
        orderNumber: 'TRD-1001',
        buyerId: 'b1',
        productId: 'p1',
        status: 'completed',
      });
      // Farklı kullanıcı → membership değil; buyer kontrolü Forbidden atmalı
      await expect(
        service.createProductRating('other', {
          orderId: 'o1',
          productId: 'p1',
          score: 5,
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('createUserRating (satıcı değerlendirmesi)', () => {
    it('"MEM-" siparişinde satıcı değerlendirmesini reddeder', async () => {
      const service = makeService({
        id: 'o1',
        orderNumber: 'MEM-1781257318265-BENIPST9F',
        buyerId: 'giver1',
        sellerId: 'r1',
        status: 'completed',
      });
      await expect(
        service.createUserRating('giver1', {
          receiverId: 'r1',
          orderId: 'o1',
          score: 5,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
