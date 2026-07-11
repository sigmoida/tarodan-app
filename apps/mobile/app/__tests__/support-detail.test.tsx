/**
 * Destek talebi detayı — mobil UI dilimi.
 * Önceden mobilde detay ekranı yoktu (getTicket/addMessage hiç çağrılmıyordu).
 * Bu testler: getTicket ile başlık+durum+mesaj thread render (Siz / Destek Ekibi),
 * yanıt gönderme → addMessage çağrısı, boş yanıtta Gönder disable, kapalı talepte
 * yanıt alanı yerine "kapatılmıştır" bilgisi.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ id: 'ticket-1' }),
}));

jest.mock('@/services/api', () => ({
  supportApi: { getTicket: jest.fn(), addMessage: jest.fn() },
}));
import { supportApi } from '@/services/api';
const getTicketMock = supportApi.getTicket as jest.Mock;
const addMessageMock = supportApi.addMessage as jest.Mock;

jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}));

jest.mock('@/services/sentry', () => ({ captureException: jest.fn() }));

import SupportTicketDetailScreen from '../support/[id]';

function ticketFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    ticketNumber: 'TKT-1001',
    creatorId: 'user-1',
    subject: 'Siparişim kargoya verilmedi',
    category: 'shipping',
    status: 'in_progress',
    createdAt: '2026-06-20T10:00:00.000Z',
    messages: [
      { id: 'm1', senderId: 'user-1', senderName: 'Ali', content: 'Siparişim hâlâ kargoda görünmüyor.', isInternal: false, createdAt: '2026-06-20T10:00:00.000Z' },
      { id: 'm2', senderId: 'agent-9', senderName: 'Destek', content: 'Merhaba, kontrol ediyoruz.', isInternal: false, createdAt: '2026-06-20T11:00:00.000Z' },
    ],
    ...overrides,
  };
}

describe('Destek talebi detayı', () => {
  beforeEach(() => {
    getTicketMock.mockReset();
    addMessageMock.mockReset();
  });

  it('getTicket ile başlık, durum ve mesaj thread render edilir', async () => {
    getTicketMock.mockResolvedValue({ data: ticketFixture() });
    renderWithProviders(<SupportTicketDetailScreen />);
    await waitFor(() => expect(screen.getByText('Siparişim kargoya verilmedi')).toBeOnTheScreen());
    expect(screen.getByText('#TKT-1001')).toBeOnTheScreen();
    expect(screen.getByText('İnceleniyor')).toBeOnTheScreen();
    // kendi mesajı "Siz", destek mesajı gönderen adıyla
    expect(screen.getByText('Siz')).toBeOnTheScreen();
    expect(screen.getByText('Destek')).toBeOnTheScreen();
    expect(screen.getByText('Siparişim hâlâ kargoda görünmüyor.')).toBeOnTheScreen();
    expect(screen.getByText('Merhaba, kontrol ediyoruz.')).toBeOnTheScreen();
  });

  it('boş yanıtta Gönder disable, metin girilince addMessage çağrılır', async () => {
    getTicketMock.mockResolvedValue({ data: ticketFixture() });
    addMessageMock.mockResolvedValue({ data: ticketFixture() });
    renderWithProviders(<SupportTicketDetailScreen />);
    await waitFor(() => expect(screen.getByText('Siparişim kargoya verilmedi')).toBeOnTheScreen());

    expect(screen.getByText('Gönder')).toBeDisabled();

    const inputs = screen.UNSAFE_getAllByType(TextInput);
    fireEvent.changeText(inputs[0], 'Herhangi bir gelişme var mı?');
    expect(screen.getByText('Gönder')).not.toBeDisabled();

    fireEvent.press(screen.getByText('Gönder'));
    await waitFor(() =>
      expect(addMessageMock).toHaveBeenCalledWith('ticket-1', { content: 'Herhangi bir gelişme var mı?' }),
    );
  });

  it('kapalı talepte yanıt alanı yerine "kapatılmıştır" bilgisi gösterilir', async () => {
    getTicketMock.mockResolvedValue({ data: ticketFixture({ status: 'closed' }) });
    renderWithProviders(<SupportTicketDetailScreen />);
    expect(
      await screen.findByText('Bu talep kapatılmıştır. Yeni bir sorun için destek talebi oluşturabilirsiniz.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Gönder')).toBeNull();
  });
});
