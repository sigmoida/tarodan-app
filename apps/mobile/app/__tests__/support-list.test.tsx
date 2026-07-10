/**
 * Destek Taleplerim (liste) — mobil UI dilimi.
 * Önceden mobilde ticket görüntüleme ekranı yoktu (getMyTickets hiç çağrılmıyordu).
 * Bu testler: giriş gerekli durumu + login navigasyonu, getMyTickets ile liste render
 * (konu + durum rozeti), boş durum, "Yeni Talep Oluştur" → /support/new, satıra
 * dokununca /support/[id] detayına gitme.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useFocusEffect: jest.fn(),
}));
import { router } from 'expo-router';
const mockPush = router.push as jest.Mock;

jest.mock('@/services/api', () => ({
  supportApi: { getMyTickets: jest.fn() },
}));
import { supportApi } from '@/services/api';
const getMyTicketsMock = supportApi.getMyTickets as jest.Mock;

let mockIsAuthenticated = true;
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

import SupportTicketsScreen from '../support';

function ticketFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    ticketNumber: 'TKT-1001',
    subject: 'Siparişim kargoya verilmedi',
    category: 'shipping',
    status: 'open',
    createdAt: '2026-06-20T10:00:00.000Z',
    messageCount: 1,
    ...overrides,
  };
}

describe('Destek Taleplerim (liste)', () => {
  beforeEach(() => {
    getMyTicketsMock.mockReset();
    mockPush.mockReset();
    mockIsAuthenticated = true;
  });

  it('giriş yapılmamışsa "Giriş Gerekli" benzeri durum + login navigasyonu', () => {
    mockIsAuthenticated = false;
    renderWithProviders(<SupportTicketsScreen />);
    expect(screen.getByText('Giriş Yap')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Giriş Yap'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
    expect(getMyTicketsMock).not.toHaveBeenCalled();
  });

  it('getMyTickets ile talepler render edilir (konu + durum rozeti)', async () => {
    getMyTicketsMock.mockResolvedValue({ data: { tickets: [ticketFixture()] } });
    renderWithProviders(<SupportTicketsScreen />);
    await waitFor(() => expect(screen.getByText('Siparişim kargoya verilmedi')).toBeOnTheScreen());
    expect(screen.getByText('#TKT-1001')).toBeOnTheScreen();
    expect(screen.getByText('Açık')).toBeOnTheScreen();
  });

  it('hiç talep yoksa boş durum gösterilir', async () => {
    getMyTicketsMock.mockResolvedValue({ data: { tickets: [] } });
    renderWithProviders(<SupportTicketsScreen />);
    expect(await screen.findByText('Henüz destek talebiniz yok')).toBeOnTheScreen();
  });

  it('"Yeni Talep Oluştur" → /support/new', async () => {
    getMyTicketsMock.mockResolvedValue({ data: { tickets: [] } });
    renderWithProviders(<SupportTicketsScreen />);
    fireEvent.press(screen.getByText('Yeni Talep Oluştur'));
    expect(mockPush).toHaveBeenCalledWith('/support/new');
  });

  it('talebe dokununca /support/[id] detayına gider', async () => {
    getMyTicketsMock.mockResolvedValue({ data: { tickets: [ticketFixture()] } });
    renderWithProviders(<SupportTicketsScreen />);
    fireEvent.press(await screen.findByText('Siparişim kargoya verilmedi'));
    expect(mockPush).toHaveBeenCalledWith('/support/ticket-1');
  });
});
