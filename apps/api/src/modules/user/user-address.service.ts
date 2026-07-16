import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { OrderStatus } from '@prisma/client';
import { i18nMessage } from '../i18n';

/** Edge case 1.11: allow address delete only when no open order references it as shipping (terminal orders keep JSON snapshot). */
const ADDRESS_DELETE_BLOCKED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.pending_payment,
  OrderStatus.paid,
  OrderStatus.preparing,
  OrderStatus.shipped,
  OrderStatus.delivered,
  OrderStatus.refund_requested,
];

/**
 * UserAddressService — adres CRUD: addAddress (maks 3), updateAddress,
 * deleteAddress (açık sipariş bağlıysa engeller), getAddresses.
 */
@Injectable()
export class UserAddressService {
  private readonly logger = new Logger(UserAddressService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Add user address
   * Maximum 3 addresses per user
   */
  async addAddress(
    userId: string,
    data: {
      title?: string;
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
      isDefault?: boolean;
    },
  ) {
    // Count existing addresses
    const existingAddresses = await this.prisma.address.count({
      where: { userId },
    });

    // Check address limit (max 3)
    if (existingAddresses >= 3) {
      throw new BadRequestException(i18nMessage('server.user.addressLimitReached'));
    }

    const title = (data.title?.trim() && data.title.trim()) || `Adres ${existingAddresses + 1}`;

    // If this is the default address, unset other defaults
    if (data.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.create({
      data: {
        userId,
        fullName: data.fullName,
        phone: data.phone,
        title,
        city: data.city,
        district: data.district,
        address: data.address,
        zipCode: data.zipCode,
        isDefault: data.isDefault ?? existingAddresses === 0,
      },
    });
  }

  /**
   * Update user address
   */
  async updateAddress(
    userId: string,
    addressId: string,
    data: {
      title?: string;
      city?: string;
      district?: string;
      address?: string;
      zipCode?: string;
      isDefault?: boolean;
    },
  ) {
    // Verify ownership
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException(i18nMessage('server.user.addressNotFound'));
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, NOT: { id: addressId } },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.update({
      where: { id: addressId },
      data,
    });
  }

  /**
   * Delete user address
   */
  async deleteAddress(userId: string, addressId: string) {
    // Verify ownership
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException(i18nMessage('server.user.addressNotFound'));
    }

    const openOrdersUsingAddress = await this.prisma.order.count({
      where: {
        buyerId: userId,
        shippingAddressId: addressId,
        status: { in: ADDRESS_DELETE_BLOCKED_ORDER_STATUSES },
      },
    });
    if (openOrdersUsingAddress > 0) {
      throw new BadRequestException(
        i18nMessage('server.user.addressHasOpenOrders'),
      );
    }

    await this.prisma.address.delete({
      where: { id: addressId },
    });

    // If deleted address was default, set another as default
    if (address.isDefault) {
      const firstAddress = await this.prisma.address.findFirst({
        where: { userId },
      });

      if (firstAddress) {
        await this.prisma.address.update({
          where: { id: firstAddress.id },
          data: { isDefault: true },
        });
      }
    }

    // #224: mesaj artık UserController.deleteAddress() tarafından locale'e göre
    // kuruluyor (server.user.addressDeleted) — servis burada sabit metin döndürmüyor.
  }

  /**
   * Get user's addresses
   */
  async getAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
