import { ApiClient } from '../client';
import {
  SupportTicket,
  TicketWithMessages,
  CreateTicketDto,
  ReplyToTicketDto,
  PaginatedResponse,
} from '@tarodan/types';

export class SupportEndpoints {
  constructor(private client: ApiClient) {}

  async getMyTickets(query?: { page?: number; limit?: number; status?: string }): Promise<PaginatedResponse<SupportTicket>> {
    const response = await this.client.get<PaginatedResponse<SupportTicket>>('/support/tickets/me', { params: query });
    return response.data;
  }

  async getTicket(id: string): Promise<TicketWithMessages> {
    const response = await this.client.get<TicketWithMessages>(`/support/tickets/${id}`);
    return response.data;
  }

  async createTicket(data: CreateTicketDto): Promise<SupportTicket> {
    const response = await this.client.post<SupportTicket>('/support/tickets', data);
    return response.data;
  }

  async replyToTicket(id: string, data: ReplyToTicketDto): Promise<void> {
    await this.client.post(`/support/tickets/${id}/messages`, data);
  }

  async closeTicket(id: string): Promise<SupportTicket> {
    const response = await this.client.post<SupportTicket>(`/support/tickets/${id}/close`);
    return response.data;
  }

  async reopenTicket(id: string): Promise<SupportTicket> {
    const response = await this.client.post<SupportTicket>(`/support/tickets/${id}/reopen`);
    return response.data;
  }
}
