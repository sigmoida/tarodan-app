/**
 * Shipping Processing Worker
 * Handles shipment creation, tracking updates, and carrier webhooks
 */
import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { PaymentService } from '../modules/payment/payment.service';
import { ShipmentStatus, OrderStatus } from '@prisma/client';

export interface ShippingJobData {
  type: 'create-shipment' | 'track-update' | 'webhook' | 'generate-label';
  orderId?: string;
  shipmentId?: string;
  carrier?: 'aras' | 'yurtici' | 'mng';
  trackingNumber?: string;
  webhookData?: Record<string, any>;
}

@Processor('shipping')
export class ShippingWorker {
  private readonly logger = new Logger(ShippingWorker.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  @Process('create-shipment')
  async handleCreateShipment(job: Job<ShippingJobData>) {
    this.logger.log(`Processing create shipment job ${job.id} for order ${job.data.orderId}`);

    const { orderId, carrier = 'aras' } = job.data;

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: true,
          product: true,
        },
      });

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Generate tracking number (in production: call carrier API)
      const trackingNumber = this.generateTrackingNumber(carrier);

      // Create shipment record
      const shipment = await this.prisma.shipment.create({
        data: {
          orderId: orderId!,
          provider: carrier,
          trackingNumber,
          status: ShipmentStatus.label_created,
          estimatedDelivery: this.calculateEstimatedDelivery(carrier),
        },
      });

      // Update order status
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.shipped },
      });

      this.logger.log(`Shipment created: ${shipment.id}, tracking: ${trackingNumber}`);

      return {
        success: true,
        shipmentId: shipment.id,
        trackingNumber,
        carrier,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create shipment for order ${orderId}: ${error.message}`);
      throw error;
    }
  }

  @Process('track-update')
  async handleTrackUpdate(job: Job<ShippingJobData>) {
    this.logger.log(`Processing tracking update job ${job.id}`);

    const { shipmentId, trackingNumber } = job.data;

    try {
      const shipment = await this.prisma.shipment.findFirst({
        where: shipmentId ? { id: shipmentId } : { trackingNumber },
      });

      if (!shipment) {
        throw new Error(`Shipment not found: ${shipmentId || trackingNumber}`);
      }

      // In production: Call carrier tracking API
      const trackingInfo = await this.fetchTrackingInfo(
        shipment.provider,
        shipment.trackingNumber || '',
      );

      // Update shipment status
      const newStatus = this.mapStatusToEnum(trackingInfo.status);
      await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status: newStatus,
        },
      });

      // Create shipment event for tracking history
      await this.prisma.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          status: trackingInfo.status,
          location: trackingInfo.lastLocation,
          occurredAt: new Date(),
        },
      });

      // If delivered, update order and release payment hold
      if (newStatus === ShipmentStatus.delivered) {
        await this.prisma.order.update({
          where: { id: shipment.orderId },
          data: {
            status: OrderStatus.delivered,
          },
        });
        try {
          const released = await this.paymentService.releasePaymentIfHeld(shipment.orderId);
          if (released) this.logger.log(`Payment hold released for order ${shipment.orderId} (track-update)`);
        } catch (e: any) {
          this.logger.warn(`Could not release payment for order ${shipment.orderId}: ${e?.message}`);
        }
      }

      return {
        success: true,
        shipmentId: shipment.id,
        status: trackingInfo.status,
      };
    } catch (error: any) {
      this.logger.error(`Failed to update tracking: ${error.message}`);
      throw error;
    }
  }

  @Process('webhook')
  async handleWebhook(job: Job<ShippingJobData>) {
    this.logger.log(`Processing shipping webhook job ${job.id}`);

    const { webhookData, carrier } = job.data;

    try {
      if (!carrier || !webhookData) {
        throw new Error('Missing carrier or webhook data');
      }

      // Parse webhook based on carrier
      const trackingNumber = this.parseWebhookTrackingNumber(carrier, webhookData);
      const statusStr = this.parseWebhookStatus(carrier, webhookData);
      const status = this.mapStatusToEnum(statusStr);

      const shipment = await this.prisma.shipment.findFirst({
        where: { trackingNumber, provider: carrier },
      });

      if (!shipment) {
        this.logger.warn(`Shipment not found for webhook: ${trackingNumber}`);
        return { success: false, reason: 'Shipment not found' };
      }

      // Update shipment
      await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status,
          updatedAt: new Date(),
        },
      });

      // Handle delivery: update order and release payment hold
      if (status === ShipmentStatus.delivered) {
        await this.prisma.order.update({
          where: { id: shipment.orderId },
          data: {
            status: OrderStatus.delivered,
          },
        });
        try {
          const released = await this.paymentService.releasePaymentIfHeld(shipment.orderId);
          if (released) this.logger.log(`Payment hold released for order ${shipment.orderId} (webhook)`);
        } catch (e: any) {
          this.logger.warn(`Could not release payment for order ${shipment.orderId}: ${e?.message}`);
        }
      }

      return { success: true, shipmentId: shipment.id, status };
    } catch (error: any) {
      this.logger.error(`Failed to process shipping webhook: ${error.message}`);
      throw error;
    }
  }

  @Process('generate-label')
  async handleGenerateLabel(job: Job<ShippingJobData>) {
    this.logger.log(`Processing label generation job ${job.id}`);

    const { orderId, carrier = 'aras' } = job.data;

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          seller: true,
        },
      });

      // Find the shipment for this order
      const shipment = await this.prisma.shipment.findFirst({
        where: { orderId },
      });

      if (!order || !shipment) {
        throw new Error(`Order or shipment not found: ${orderId}`);
      }

      // In production: Call carrier API to generate label
      const labelUrl = await this.generateCarrierLabel(carrier, order, shipment);

      // Update shipment with label URL
      await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: { labelUrl },
      });

      return {
        success: true,
        shipmentId: shipment.id,
        labelUrl,
      };
    } catch (error: any) {
      this.logger.error(`Failed to generate label for order ${orderId}: ${error.message}`);
      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Shipping job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Shipping job ${job.id} failed: ${error.message}`);
  }

  private generateTrackingNumber(carrier: string): string {
    const prefix = carrier.toUpperCase().substring(0, 2);
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }

  private calculateEstimatedDelivery(carrier: string): Date {
    const days = carrier === 'aras' ? 3 : carrier === 'yurtici' ? 2 : 4;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private async fetchTrackingInfo(
    carrier: string,
    trackingNumber: string,
  ): Promise<{ status: string; lastLocation: string }> {
    // In production: Call actual carrier API
    this.logger.log(`Fetching tracking info for ${carrier}: ${trackingNumber}`);
    return {
      status: 'IN_TRANSIT',
      lastLocation: 'İstanbul Dağıtım Merkezi',
    };
  }

  private parseWebhookTrackingNumber(carrier: string, data: Record<string, any>): string {
    // Parse tracking number based on carrier webhook format
    return data?.trackingNumber || data?.tracking_number || data?.barcode || '';
  }

  private parseWebhookStatus(carrier: string, data: Record<string, any>): string {
    // Map carrier status to our status
    return data?.status || 'IN_TRANSIT';
  }

  private mapStatusToEnum(status: string): ShipmentStatus {
    const statusMap: Record<string, ShipmentStatus> = {
      'PICKED_UP': ShipmentStatus.picked_up,
      'IN_TRANSIT': ShipmentStatus.in_transit,
      'OUT_FOR_DELIVERY': ShipmentStatus.out_for_delivery,
      'DELIVERED': ShipmentStatus.delivered,
      'RETURNED': ShipmentStatus.returned,
      'FAILED': ShipmentStatus.failed,
    };
    return statusMap[status] || ShipmentStatus.in_transit;
  }

  private async generateCarrierLabel(carrier: string, order: any, shipment: any): Promise<string> {
    // In production: Call carrier API to generate shipping label
    this.logger.log(`Generating ${carrier} label for order ${order.id}`);
    return `https://storage.tarodan.com/labels/${shipment.trackingNumber}.pdf`;
  }
}
