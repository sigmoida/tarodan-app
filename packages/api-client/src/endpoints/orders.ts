import { ApiClient } from '../client';
import {
  Order,
  OrderWithDetails,
  CreateOrderDto,
  GuestCheckoutDto,
  InitiatePaymentDto,
  PaginatedResponse,
} from '@tarodan/types';

export class OrderEndpoints {
  constructor(private client: ApiClient) {}

  async getAll(query?: { page?: number; limit?: number; status?: string }): Promise<PaginatedResponse<OrderWithDetails>> {
    const response = await this.client.get<PaginatedResponse<OrderWithDetails>>('/orders', { params: query });
    return response.data;
  }

  async getById(id: string): Promise<OrderWithDetails> {
    const response = await this.client.get<OrderWithDetails>(`/orders/${id}`);
    return response.data;
  }

  async getByOrderNumber(orderNumber: string): Promise<OrderWithDetails> {
    const response = await this.client.get<OrderWithDetails>(`/orders/number/${orderNumber}`);
    return response.data;
  }

  async create(data: CreateOrderDto): Promise<Order> {
    const response = await this.client.post<Order>('/orders', data);
    return response.data;
  }

  async sendGuestVerificationCode(body: {
    email: string;
    expectedCheckoutCount?: number;
  }): Promise<{ success: boolean; expiresInSeconds: number }> {
    const response = await this.client.post<{ success: boolean; expiresInSeconds: number }>(
      '/orders/guest/send-verification-code',
      body,
    );
    return response.data;
  }

  async guestCheckout(data: GuestCheckoutDto): Promise<Order> {
    const response = await this.client.post<Order>('/orders/guest', data);
    return response.data;
  }

  async cancel(id: string, reason?: string): Promise<Order> {
    const response = await this.client.post<Order>(`/orders/${id}/cancel`, { reason });
    return response.data;
  }

  async initiatePayment(data: InitiatePaymentDto): Promise<{ paymentUrl: string; token: string }> {
    const response = await this.client.post<{ paymentUrl: string; token: string }>('/payments/initiate', data);
    return response.data;
  }

  async confirmPayment(orderId: string, paymentToken: string): Promise<Order> {
    const response = await this.client.post<Order>(`/payments/${orderId}/confirm`, { paymentToken });
    return response.data;
  }

  async getMySales(query?: { page?: number; limit?: number; status?: string }): Promise<PaginatedResponse<OrderWithDetails>> {
    const response = await this.client.get<PaginatedResponse<OrderWithDetails>>('/orders/sales', { params: query });
    return response.data;
  }

  async shipOrder(id: string, trackingNumber: string, carrier: string): Promise<Order> {
    const response = await this.client.post<Order>(`/orders/${id}/ship`, { trackingNumber, carrier });
    return response.data;
  }

  async confirmDelivery(id: string): Promise<Order> {
    const response = await this.client.post<Order>(`/orders/${id}/confirm-delivery`);
    return response.data;
  }

  /**
   * 48h pencere — alıcı erken onay (Faz 4C.1).
   */
  async confirmReceipt(id: string): Promise<{ completed: boolean }> {
    const response = await this.client.post<{ completed: boolean }>(
      `/orders/${id}/confirm-receipt`,
    );
    return response.data;
  }
}
