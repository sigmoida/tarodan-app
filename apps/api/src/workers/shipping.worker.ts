/**
 * Shipping Processing Worker
 * Handles shipment creation, tracking updates, and carrier webhooks
 */
import {
  Processor,
  Process,
  OnQueueFailed,
  OnQueueCompleted,
} from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma";
import { PaymentService } from "../modules/payment/payment.service";
import { SuratTrackingService } from "../modules/surat-cargo/surat-tracking.service";
import { NotificationService } from "../modules/notification/notification.service";
import { ShipmentStatus, OrderStatus } from "@prisma/client";
import { canTransitionShipmentStatus } from "../modules/shipping/shipment-state-machine";

export interface ShippingJobData {
  type:
    | "create-shipment"
    | "track-update"
    | "webhook"
    | "generate-label"
    | "surat-sync"
    | "surat-sync-all";
  orderId?: string;
  shipmentId?: string;
  carrier?: "surat";
  trackingNumber?: string;
  webhookData?: Record<string, any>;
}

@Processor("shipping")
export class ShippingWorker {
  private readonly logger = new Logger(ShippingWorker.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly suratTrackingService: SuratTrackingService,
    private readonly notificationService: NotificationService,
  ) {}

  @Process("create-shipment")
  async handleCreateShipment(job: Job<ShippingJobData>) {
    this.logger.log(
      `Processing create shipment job ${job.id} for order ${job.data.orderId}`,
    );

    const { orderId, carrier = "surat" } = job.data;

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

      // Alıcıya "kargoya verildi" bildirimi (push + in_app). Önceden notifyOrderShipped
      // hiçbir yerden çağrılmıyordu → kargolanma sessizdi.
      try {
        await this.notificationService.notifyOrderShipped(
          order.buyerId,
          orderId,
          trackingNumber,
        );
      } catch (e: any) {
        this.logger.warn(
          `notifyOrderShipped failed for ${orderId}: ${e?.message}`,
        );
      }

      this.logger.log(
        `Shipment created: ${shipment.id}, tracking: ${trackingNumber}`,
      );

      return {
        success: true,
        shipmentId: shipment.id,
        trackingNumber,
        carrier,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to create shipment for order ${orderId}: ${error.message}`,
      );
      throw error;
    }
  }

  @Process("track-update")
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

      // Sürat Kargo uses its own tracking service (the only active carrier)
      if (shipment.provider === "surat") {
        const success = await this.suratTrackingService.syncShipmentTracking(
          shipment.id,
        );
        return { success, shipmentId: shipment.id, provider: "surat" };
      }

      // Legacy/fallback tracking path for any non-Sürat records (mock)
      const trackingInfo = await this.fetchTrackingInfo(
        shipment.provider,
        shipment.trackingNumber || "",
      );

      // Update shipment status
      const newStatus = this.mapStatusToEnum(trackingInfo.status);
      // #86: don't regress a terminal shipment from a stale/legacy tracking read.
      if (!canTransitionShipmentStatus(shipment.status, newStatus)) {
        this.logger.warn(
          `Skipping illegal shipment transition ${shipment.status} → ${newStatus} for ${shipment.id} (worker track-update)`,
        );
        return { success: true, shipmentId: shipment.id, skipped: true };
      }
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

      // If delivered: tek kanonik handler order geçişini + escrow schedule'ı + 48h
      // dallanmasını yapar. Bildirim (48h modunda) burada, teslim I/O'sunu bloklamadan.
      if (newStatus === ShipmentStatus.delivered) {
        const res = await this.paymentService.handleOrderDelivered(
          shipment.orderId,
          new Date(),
        );
        if (
          res.acted &&
          res.use48h &&
          res.confirmationDeadline &&
          res.buyerId
        ) {
          this.logger.log(
            `Order ${shipment.orderId} entered 48h window (track-update); deadline=${res.confirmationDeadline.toISOString()}`,
          );
          try {
            await this.notificationService.notifyOrderDeliveredConfirm(
              res.buyerId,
              shipment.orderId,
              res.confirmationDeadline,
            );
          } catch (e: any) {
            this.logger.warn(
              `notify delivered-confirm failed (track-update) for ${shipment.orderId}: ${e?.message}`,
            );
          }
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

  /**
   * Sync a single Sürat shipment's tracking status.
   */
  @Process("surat-sync")
  async handleSuratSync(job: Job<ShippingJobData>) {
    this.logger.log(
      `Processing Surat sync job ${job.id} for shipment ${job.data.shipmentId}`,
    );

    const { shipmentId } = job.data;
    if (!shipmentId) {
      throw new Error("shipmentId required for surat-sync");
    }

    const success =
      await this.suratTrackingService.syncShipmentTracking(shipmentId);
    return { success, shipmentId };
  }

  /**
   * Sync all active Sürat shipments. Intended for periodic cron/scheduled jobs.
   */
  @Process("surat-sync-all")
  async handleSuratSyncAll(job: Job<ShippingJobData>) {
    this.logger.log(`Processing Surat sync-all job ${job.id}`);
    const result = await this.suratTrackingService.syncAllActiveShipments();
    return result;
  }

  @Process("webhook")
  async handleWebhook(job: Job<ShippingJobData>) {
    this.logger.log(`Processing shipping webhook job ${job.id}`);

    const { webhookData, carrier } = job.data;

    try {
      if (!carrier || !webhookData) {
        throw new Error("Missing carrier or webhook data");
      }

      // Parse webhook based on carrier
      const trackingNumber = this.parseWebhookTrackingNumber(
        carrier,
        webhookData,
      );
      const statusStr = this.parseWebhookStatus(carrier, webhookData);
      const status = this.mapStatusToEnum(statusStr);

      const shipment = await this.prisma.shipment.findFirst({
        where: { trackingNumber, provider: carrier },
      });

      if (!shipment) {
        this.logger.warn(`Shipment not found for webhook: ${trackingNumber}`);
        return { success: false, reason: "Shipment not found" };
      }

      // #86: ignore out-of-order webhook events that would regress a terminal shipment.
      if (!canTransitionShipmentStatus(shipment.status, status)) {
        this.logger.warn(
          `Skipping illegal shipment transition ${shipment.status} → ${status} for ${shipment.id} (worker webhook ${carrier})`,
        );
        return { success: true, shipmentId: shipment.id, skipped: true };
      }

      // Update shipment
      await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status,
          updatedAt: new Date(),
        },
      });

      // Handle delivery: tek kanonik handler order geçişini + escrow schedule'ı + 48h
      // dallanmasını yapar. Bildirim (48h modunda) burada, teslim I/O'sunu bloklamadan.
      if (status === ShipmentStatus.delivered) {
        const res = await this.paymentService.handleOrderDelivered(
          shipment.orderId,
          new Date(),
        );
        if (
          res.acted &&
          res.use48h &&
          res.confirmationDeadline &&
          res.buyerId
        ) {
          this.logger.log(
            `Order ${shipment.orderId} entered 48h window (webhook); deadline=${res.confirmationDeadline.toISOString()}`,
          );
          try {
            await this.notificationService.notifyOrderDeliveredConfirm(
              res.buyerId,
              shipment.orderId,
              res.confirmationDeadline,
            );
          } catch (e: any) {
            this.logger.warn(
              `notify delivered-confirm failed (webhook) for ${shipment.orderId}: ${e?.message}`,
            );
          }
        }
      }

      return { success: true, shipmentId: shipment.id, status };
    } catch (error: any) {
      this.logger.error(`Failed to process shipping webhook: ${error.message}`);
      throw error;
    }
  }

  @Process("generate-label")
  async handleGenerateLabel(job: Job<ShippingJobData>) {
    this.logger.log(`Processing label generation job ${job.id}`);

    const { orderId, carrier = "surat" } = job.data;

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
      const labelUrl = await this.generateCarrierLabel(
        carrier,
        order,
        shipment,
      );

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
      this.logger.error(
        `Failed to generate label for order ${orderId}: ${error.message}`,
      );
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

  private calculateEstimatedDelivery(_carrier: string): Date {
    // Sürat Kargo: 3 iş günü tahmini teslim
    const days = 3;
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
      status: "IN_TRANSIT",
      lastLocation: "İstanbul Dağıtım Merkezi",
    };
  }

  private parseWebhookTrackingNumber(
    carrier: string,
    data: Record<string, any>,
  ): string {
    // Parse tracking number based on carrier webhook format
    return data?.trackingNumber || data?.tracking_number || data?.barcode || "";
  }

  private parseWebhookStatus(
    carrier: string,
    data: Record<string, any>,
  ): string {
    // Map carrier status to our status
    return data?.status || "IN_TRANSIT";
  }

  private mapStatusToEnum(status: string): ShipmentStatus {
    const statusMap: Record<string, ShipmentStatus> = {
      PICKED_UP: ShipmentStatus.picked_up,
      IN_TRANSIT: ShipmentStatus.in_transit,
      AT_DELIVERY_BRANCH: ShipmentStatus.at_delivery_branch,
      OUT_FOR_DELIVERY: ShipmentStatus.out_for_delivery,
      DELIVERED: ShipmentStatus.delivered,
      RETURN_IN_PROGRESS: ShipmentStatus.return_in_progress,
      RETURNED: ShipmentStatus.returned,
      FAILED: ShipmentStatus.failed,
      CANCELLED: ShipmentStatus.cancelled,
    };
    return statusMap[status] || ShipmentStatus.in_transit;
  }

  private async generateCarrierLabel(
    carrier: string,
    order: any,
    shipment: any,
  ): Promise<string> {
    // In production: Call carrier API to generate shipping label
    this.logger.log(`Generating ${carrier} label for order ${order.id}`);
    return `https://storage.tarodan.com/labels/${shipment.trackingNumber}.pdf`;
  }
}
