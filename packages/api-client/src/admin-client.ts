import { ApiClient } from './client';
import {
  DashboardStats,
  SalesReport,
  UserReport,
  CommissionRule,
  CreateCommissionRuleDto,
  SystemSettings,
  AuditLog,
  ModerationItem,
  PaginatedResponse,
  User,
  Product,
  Order,
} from '@tarodan/types';

export class AdminApiClient {
  constructor(private client: ApiClient) {}

  // Dashboard
  async getDashboard(): Promise<DashboardStats> {
    const response = await this.client.get<DashboardStats>('/admin/dashboard');
    return response.data;
  }

  // Users
  async getUsers(params?: Record<string, any>): Promise<PaginatedResponse<User>> {
    const response = await this.client.get<PaginatedResponse<User>>('/admin/users', { params });
    return response.data;
  }

  async getUser(id: string): Promise<User> {
    const response = await this.client.get<User>(`/admin/users/${id}`);
    return response.data;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const response = await this.client.patch<User>(`/admin/users/${id}`, data);
    return response.data;
  }

  async suspendUser(id: string, reason: string): Promise<void> {
    await this.client.post(`/admin/users/${id}/suspend`, { reason });
  }

  async unsuspendUser(id: string): Promise<void> {
    await this.client.post(`/admin/users/${id}/unsuspend`);
  }

  // Products
  async getProducts(params?: Record<string, any>): Promise<PaginatedResponse<Product>> {
    const response = await this.client.get<PaginatedResponse<Product>>('/admin/products', { params });
    return response.data;
  }

  async getProduct(id: string): Promise<Product> {
    const response = await this.client.get<Product>(`/admin/products/${id}`);
    return response.data;
  }

  async approveProduct(id: string): Promise<void> {
    await this.client.post(`/admin/products/${id}/approve`);
  }

  async rejectProduct(id: string, reason: string): Promise<void> {
    await this.client.post(`/admin/products/${id}/reject`, { reason });
  }

  // Orders
  async getOrders(params?: Record<string, any>): Promise<PaginatedResponse<Order>> {
    const response = await this.client.get<PaginatedResponse<Order>>('/admin/orders', { params });
    return response.data;
  }

  async getOrder(id: string): Promise<Order> {
    const response = await this.client.get<Order>(`/admin/orders/${id}`);
    return response.data;
  }

  // 48h pencere müdahaleleri (Faz 4A.1)

  async forceCompleteOrder(
    id: string,
    payload: { reason?: string } = {},
  ): Promise<{ completed: boolean }> {
    const response = await this.client.post<{ completed: boolean }>(
      `/admin/orders/${id}/force-complete`,
      payload,
    );
    return response.data;
  }

  async extendOrderConfirmation(
    id: string,
    payload: { hours: number; reason?: string },
  ): Promise<{ newDeadline: string }> {
    const response = await this.client.post<{ newDeadline: string }>(
      `/admin/orders/${id}/extend-confirmation`,
      payload,
    );
    return response.data;
  }

  // Reports
  async getSalesReport(params?: { startDate?: string; endDate?: string }): Promise<SalesReport> {
    const response = await this.client.get<SalesReport>('/admin/reports/sales', { params });
    return response.data;
  }

  async getUserReport(params?: { startDate?: string; endDate?: string }): Promise<UserReport> {
    const response = await this.client.get<UserReport>('/admin/reports/users', { params });
    return response.data;
  }

  // Commission Rules
  async getCommissionRules(): Promise<CommissionRule[]> {
    const response = await this.client.get<CommissionRule[]>('/admin/commission-rules');
    return response.data;
  }

  async createCommissionRule(data: CreateCommissionRuleDto): Promise<CommissionRule> {
    const response = await this.client.post<CommissionRule>('/admin/commission-rules', data);
    return response.data;
  }

  async updateCommissionRule(id: string, data: Partial<CreateCommissionRuleDto>): Promise<CommissionRule> {
    const response = await this.client.patch<CommissionRule>(`/admin/commission-rules/${id}`, data);
    return response.data;
  }

  async deleteCommissionRule(id: string): Promise<void> {
    await this.client.delete(`/admin/commission-rules/${id}`);
  }

  // Settings
  async getSettings(): Promise<SystemSettings> {
    const response = await this.client.get<SystemSettings>('/admin/settings');
    return response.data;
  }

  async updateSettings(data: Partial<SystemSettings>): Promise<SystemSettings> {
    const response = await this.client.patch<SystemSettings>('/admin/settings', data);
    return response.data;
  }

  // Moderation
  async getModerationQueue(params?: Record<string, any>): Promise<PaginatedResponse<ModerationItem>> {
    const response = await this.client.get<PaginatedResponse<ModerationItem>>('/admin/moderation', { params });
    return response.data;
  }

  async approveModerationItem(id: string): Promise<void> {
    await this.client.post(`/admin/moderation/${id}/approve`);
  }

  async rejectModerationItem(id: string, reason: string): Promise<void> {
    await this.client.post(`/admin/moderation/${id}/reject`, { reason });
  }

  // Audit Logs
  async getAuditLogs(params?: Record<string, any>): Promise<PaginatedResponse<AuditLog>> {
    const response = await this.client.get<PaginatedResponse<AuditLog>>('/admin/audit-logs', { params });
    return response.data;
  }
}

export const createAdminApiClient = (client: ApiClient): AdminApiClient => {
  return new AdminApiClient(client);
};
