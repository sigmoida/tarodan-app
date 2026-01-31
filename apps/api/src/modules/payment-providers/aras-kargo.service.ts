import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// =============================================================================
// ARAS KARGO API TYPES
// =============================================================================

export interface ArasAddress {
  name: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
}

export interface ArasShipmentRequest {
  senderAddress: ArasAddress;
  receiverAddress: ArasAddress;
  weight: number; // kg
  width?: number; // cm
  height?: number; // cm
  length?: number; // cm
  productValue?: number; // TRY
  paymentType: 'SENDER' | 'RECEIVER';
  referenceNumber: string;
  description?: string;
}

export interface ArasShipmentResponse {
  success: boolean;
  trackingNumber: string;
  barcode: string;
  estimatedDeliveryDate: string;
  cost: number;
  labelUrl?: string;
}

export interface ArasTrackingResponse {
  success: boolean;
  status: string;
  statusCode: string;
  events: Array<{
    date: string;
    time: string;
    status: string;
    location: string;
    description: string;
  }>;
  deliveredAt?: string;
  signedBy?: string;
}

export interface ArasRateResponse {
  success: boolean;
  rates: Array<{
    serviceType: string;
    serviceName: string;
    price: number;
    estimatedDays: number;
  }>;
}

// =============================================================================
// ARAS KARGO SERVICE
// =============================================================================

@Injectable()
export class ArasKargoService {
  private readonly logger = new Logger(ArasKargoService.name);
  private readonly username: string;
  private readonly password: string;
  private readonly customerCode: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.username = this.configService.get('ARAS_USERNAME', '');
    this.password = this.configService.get('ARAS_PASSWORD', '');
    this.customerCode = this.configService.get('ARAS_CUSTOMER_CODE', '');
    this.baseUrl = this.configService.get(
      'ARAS_BASE_URL',
      'https://customerws.araskargo.com.tr',
    );

    if (!this.username || !this.password || !this.customerCode) {
      this.logger.warn('Aras Kargo API credentials not configured');
    }
  }

  // ==========================================================================
  // SHIPMENT CREATION
  // ==========================================================================

  /**
   * Create shipment
   */
  async createShipment(request: ArasShipmentRequest): Promise<ArasShipmentResponse> {
    // In production, this would call the actual Aras Kargo SOAP/REST API
    // For now, returning a simulated response

    const trackingNumber = this.generateTrackingNumber();
    const barcode = `ARAS${trackingNumber}`;

    // Calculate estimated delivery (3-5 business days)
    const deliveryDays = this.calculateDeliveryDays(
      request.senderAddress.city,
      request.receiverAddress.city,
    );
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + deliveryDays);

    // Calculate cost
    const cost = this.calculateShippingCost(request);

    this.logger.log('Aras Kargo shipment created');

    return {
      success: true,
      trackingNumber,
      barcode,
      estimatedDeliveryDate: estimatedDelivery.toISOString(),
      cost,
      labelUrl: `https://api.araskargo.com.tr/label/${barcode}`,
    };
  }

  /**
   * Cancel shipment
   */
  async cancelShipment(trackingNumber: string): Promise<boolean> {
    this.logger.log('Aras Kargo shipment cancelled');
    return true;
  }

  // ==========================================================================
  // TRACKING
  // ==========================================================================

  /**
   * Get tracking info
   */
  async getTrackingInfo(trackingNumber: string): Promise<ArasTrackingResponse> {
    // In production, this would call the actual Aras Kargo tracking API
    // For now, returning simulated tracking data

    const events = this.generateTrackingEvents(trackingNumber);
    const lastEvent = events[events.length - 1];

    return {
      success: true,
      status: lastEvent.status,
      statusCode: this.getStatusCode(lastEvent.status),
      events,
      deliveredAt: lastEvent.status === 'TESLİM EDİLDİ' ? lastEvent.date : undefined,
    };
  }

  /**
   * Get multiple tracking info
   */
  async getMultipleTrackingInfo(
    trackingNumbers: string[],
  ): Promise<Record<string, ArasTrackingResponse>> {
    const results: Record<string, ArasTrackingResponse> = {};

    for (const trackingNumber of trackingNumbers) {
      results[trackingNumber] = await this.getTrackingInfo(trackingNumber);
    }

    return results;
  }

  // ==========================================================================
  // RATE CALCULATION
  // ==========================================================================

  /**
   * Get shipping rates
   */
  async getRates(
    senderCity: string,
    receiverCity: string,
    weight: number,
    dimensions?: { width: number; height: number; length: number },
  ): Promise<ArasRateResponse> {
    // Calculate desi (volumetric weight)
    let desiWeight = weight;
    if (dimensions) {
      desiWeight = (dimensions.width * dimensions.height * dimensions.length) / 3000;
    }

    const billableWeight = Math.max(weight, desiWeight);
    const baseCost = this.calculateBaseCost(senderCity, receiverCity);
    const weightCost = this.calculateWeightCost(billableWeight);

    const standardPrice = baseCost + weightCost;
    const expressPrice = standardPrice * 1.5;

    return {
      success: true,
      rates: [
        {
          serviceType: 'STANDARD',
          serviceName: 'Standart Teslimat',
          price: Math.round(standardPrice * 100) / 100,
          estimatedDays: this.calculateDeliveryDays(senderCity, receiverCity),
        },
        {
          serviceType: 'EXPRESS',
          serviceName: 'Hızlı Teslimat',
          price: Math.round(expressPrice * 100) / 100,
          estimatedDays: Math.max(
            1,
            this.calculateDeliveryDays(senderCity, receiverCity) - 1,
          ),
        },
      ],
    };
  }

  // ==========================================================================
  // BRANCH/PICKUP POINTS
  // ==========================================================================

  /**
   * Get nearest branches
   */
  async getNearestBranches(
    city: string,
    district?: string,
  ): Promise<Array<{
    code: string;
    name: string;
    address: string;
    phone: string;
    workingHours: string;
  }>> {
    // In production, this would call the actual API
    // Returning sample data
    return [
      {
        code: 'IST001',
        name: 'Kadıköy Şubesi',
        address: 'Caferağa Mah. Moda Cad. No:123, Kadıköy/İstanbul',
        phone: '0216 123 4567',
        workingHours: '09:00 - 18:00',
      },
      {
        code: 'IST002',
        name: 'Beşiktaş Şubesi',
        address: 'Sinanpaşa Mah. Ortabahçe Cad. No:45, Beşiktaş/İstanbul',
        phone: '0212 234 5678',
        workingHours: '09:00 - 18:00',
      },
    ];
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Generate tracking number
   */
  private generateTrackingNumber(): string {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `${timestamp}${random}`;
  }

  /**
   * Calculate shipping cost
   */
  private calculateShippingCost(request: ArasShipmentRequest): number {
    const baseCost = this.calculateBaseCost(
      request.senderAddress.city,
      request.receiverAddress.city,
    );

    // Calculate desi if dimensions provided
    let billableWeight = request.weight;
    if (request.width && request.height && request.length) {
      const desiWeight = (request.width * request.height * request.length) / 3000;
      billableWeight = Math.max(request.weight, desiWeight);
    }

    const weightCost = this.calculateWeightCost(billableWeight);
    return Math.round((baseCost + weightCost) * 100) / 100;
  }

  /**
   * Calculate base cost by route
   */
  private calculateBaseCost(senderCity: string, receiverCity: string): number {
    // Same city
    if (senderCity.toLowerCase() === receiverCity.toLowerCase()) {
      return 25;
    }

    // Major cities
    const majorCities = ['istanbul', 'ankara', 'izmir', 'antalya', 'bursa'];
    if (
      majorCities.includes(senderCity.toLowerCase()) &&
      majorCities.includes(receiverCity.toLowerCase())
    ) {
      return 35;
    }

    // Default
    return 45;
  }

  /**
   * Calculate weight cost
   */
  private calculateWeightCost(weight: number): number {
    if (weight <= 1) return 0;
    if (weight <= 5) return (weight - 1) * 5;
    if (weight <= 10) return 20 + (weight - 5) * 4;
    if (weight <= 30) return 40 + (weight - 10) * 3;
    return 100 + (weight - 30) * 2.5;
  }

  /**
   * Calculate delivery days
   */
  private calculateDeliveryDays(senderCity: string, receiverCity: string): number {
    if (senderCity.toLowerCase() === receiverCity.toLowerCase()) {
      return 1;
    }

    const majorCities = ['istanbul', 'ankara', 'izmir', 'antalya', 'bursa'];
    if (
      majorCities.includes(senderCity.toLowerCase()) &&
      majorCities.includes(receiverCity.toLowerCase())
    ) {
      return 2;
    }

    return 3;
  }

  /**
   * Generate tracking events
   */
  private generateTrackingEvents(
    trackingNumber: string,
  ): Array<{ date: string; time: string; status: string; location: string; description: string }> {
    const now = new Date();
    const events = [];

    // Kargo alındı
    const created = new Date(now);
    created.setHours(created.getHours() - 48);
    events.push({
      date: created.toISOString().split('T')[0],
      time: '14:30',
      status: 'KARGO ALINDI',
      location: 'İstanbul Transfer Merkezi',
      description: 'Kargo gönderici tarafından teslim edildi',
    });

    // Transfer merkezinde
    const transfer = new Date(now);
    transfer.setHours(transfer.getHours() - 24);
    events.push({
      date: transfer.toISOString().split('T')[0],
      time: '08:15',
      status: 'TRANSFER MERKEZİNDE',
      location: 'İstanbul Dağıtım Merkezi',
      description: 'Kargo transfer merkezine ulaştı',
    });

    // Dağıtıma çıktı
    events.push({
      date: now.toISOString().split('T')[0],
      time: '09:00',
      status: 'DAĞITIMA ÇIKTI',
      location: 'Kadıköy Şubesi',
      description: 'Kargo dağıtıma çıkarıldı',
    });

    return events;
  }

  /**
   * Get status code from status text
   */
  private getStatusCode(status: string): string {
    const statusMap: Record<string, string> = {
      'KARGO ALINDI': 'PICKED_UP',
      'TRANSFER MERKEZİNDE': 'IN_TRANSIT',
      'DAĞITIMA ÇIKTI': 'OUT_FOR_DELIVERY',
      'TESLİM EDİLDİ': 'DELIVERED',
      'TESLİM EDİLEMEDİ': 'FAILED',
      'İADE': 'RETURNED',
    };
    return statusMap[status] || 'UNKNOWN';
  }
}
