/**
 * J103 · Yeni mesaj (konuşma oluştur) — MOBİL-UI dilimi.
 * Test edilen: manuel kullanıcı aramanın desteklenmediği bilgilendirmesi,
 * Gönder butonu enable/disable (alıcı + metin koşulu), alıcı recipientId ile
 * otomatik seçilir + alıcı kartı render, createThread çağrılır + thread'e replace
 * (navigasyon wiring), alıcı yokken Gönder pasif.
 * Backend thread/mesaj kalıcılığı + kendine-mesaj engeli backend-only (createThread
 * store/servisi mock'lanır; engel kuralı API tarafında).
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

// AsyncStorage native modülü test ortamında null; resmi jest mock'u.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-router — paylaşılan router-mock + sellerId paramını inline döndür.
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const rm = require('@/test-utils/router-mock').routerMock;
  return { ...rm, useLocalSearchParams: () => mockParams };
});
import { replaceMock, backMock, resetRouterMocks } from '@/test-utils/router-mock';

// API — profil ucu inline mock
jest.mock('@/services/api', () => ({
  api: { get: jest.fn() },
}));
import { api } from '@/services/api';

// i18n — anahtarı aynen döndür
jest.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// messagesStore — createThread izlenebilir; canSendMessage true
const mockCreateThread = jest.fn();
jest.mock('@/stores/messagesStore', () => ({
  useMessagesStore: () => ({
    canSendMessage: () => true,
    createThread: mockCreateThread,
  }),
}));

// authStore — limits
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ limits: { maxMessagesPerDay: 50 } }),
}));

import NewMessageScreen from '../new';

const getMock = api.get as jest.Mock;

describe('J103 · yeni mesaj (konuşma oluştur)', () => {
  beforeEach(() => {
    getMock.mockReset();
    mockCreateThread.mockReset();
    resetRouterMocks();
    mockParams = {};
  });

  it('J103.1 alıcı yokken manuel arama desteklenmiyor bilgisi gösterilir', () => {
    renderWithProviders(<NewMessageScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Kullanıcı ara...'), 'ahmet');
    expect(
      screen.getByText(/İsimle kullanıcı arama şu anda desteklenmiyor/),
    ).toBeOnTheScreen();
  });

  it('J103.2 alıcı yok + metin yok → Gönder butonu pasif', () => {
    renderWithProviders(<NewMessageScreen />);
    const sendBtn = screen.getByText('Gönder');
    fireEvent.press(sendBtn);
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('J103.3 recipientId ile alıcı otomatik seçilir → alıcı kartı görünür', async () => {
    mockParams = { sellerId: 'u-2' };
    getMock.mockResolvedValue({
      data: { data: { id: 'u-2', displayName: 'Ahmet Satıcı', isSeller: true } },
    });
    renderWithProviders(<NewMessageScreen />);
    await waitFor(() =>
      expect(screen.getByText('Ahmet Satıcı')).toBeOnTheScreen(),
    );
  });

  it('J103.4 alıcı seçili + metin girilip Gönder → createThread çağrılır ve thread\'e replace', async () => {
    mockParams = { sellerId: 'u-2' };
    getMock.mockResolvedValue({
      data: { data: { id: 'u-2', displayName: 'Ahmet Satıcı' } },
    });
    mockCreateThread.mockResolvedValue('thread-9');
    renderWithProviders(<NewMessageScreen />);
    await waitFor(() => expect(screen.getByText('Ahmet Satıcı')).toBeOnTheScreen());

    fireEvent.changeText(
      screen.getByPlaceholderText('Mesajınızı yazın...'),
      'Merhaba',
    );
    fireEvent.press(screen.getByText('Gönder'));

    await waitFor(() =>
      expect(mockCreateThread).toHaveBeenCalledWith('u-2', 'Merhaba', undefined),
    );
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/messages/thread-9'),
    );
  });
});
