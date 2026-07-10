/**
 * J48 · Güvenlik ekranı — "Tüm Cihazlardan Çıkış" MOBİL-UI dilimi.
 * Test edilen: buton/satır render, onayla Alert tetiklenir, destructive onPress
 * logoutAll + logout + login'e replace zincirini kurar (navigasyon wiring).
 * Backend oturum sonlandırma (token invalidation) backend-only.
 * Mevcut security.test ile ÇAKIŞMA yok: o dosya yalnız 2FA durumunu test eder.
 */
import React from 'react';
import { appAlert } from '@tarodan/ui-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// expo-router — paylaşılan router-mock
jest.mock('expo-router', () => require('@/test-utils/router-mock').routerMock);
import { replaceMock, resetRouterMocks } from '@/test-utils/router-mock';

// i18n — anahtarı aynen döndür
jest.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Oturum açık kullanıcı; logout izlenebilir
const mockLogout = jest.fn();
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true, logout: mockLogout }),
}));

// API — fn'ler factory içinde, sonra import
jest.mock('@/services/api', () => ({
  authApi: {
    getTwoFactorStatus: jest.fn(() => Promise.resolve({ data: { isEnabled: false } })),
    setupTwoFactor: jest.fn(),
    verifyTwoFactor: jest.fn(),
    disableTwoFactor: jest.fn(),
    regenerateBackupCodes: jest.fn(),
    changePassword: jest.fn(),
    logoutAll: jest.fn(),
  },
}));
import { authApi } from '@/services/api';
import SecuritySettingsScreen from '../security';

const mockLogoutAll = authApi.logoutAll as jest.Mock;

describe('J48 · Güvenlik — tüm cihazlardan çıkış', () => {
  beforeEach(() => {
    resetRouterMocks();
    mockLogout.mockClear();
    mockLogoutAll.mockReset();
    mockLogoutAll.mockResolvedValue({ data: {} });
  });

  it('J48.1 "Tüm Cihazlardan Çıkış" satırı render edilir', async () => {
    render(<SecuritySettingsScreen />);
    expect(screen.getByText('Tüm Cihazlardan Çıkış')).toBeOnTheScreen();
    expect(
      screen.getByText('Diğer tüm cihazlarda oturumunuzu sonlandırın'),
    ).toBeOnTheScreen();
  });

  it('J48.2 satıra basınca onay Alert tetiklenir', () => {
    const alertSpy = (appAlert as jest.Mock).mockImplementation(() => {});
    render(<SecuritySettingsScreen />);
    fireEvent.press(screen.getByText('Tüm Cihazlardan Çıkış'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Tüm Cihazlardan Çıkış',
      expect.any(String),
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });

  it('J48.3 onay (Çıkış Yap) → logoutAll + logout + login replace zinciri', async () => {
    let confirmOnPress: (() => void) | undefined;
    const alertSpy = (appAlert as jest.Mock)
      .mockImplementation((_t, _m, buttons: any) => {
        confirmOnPress = buttons?.find((b: any) => b.style === 'destructive')?.onPress;
      });
    render(<SecuritySettingsScreen />);
    fireEvent.press(screen.getByText('Tüm Cihazlardan Çıkış'));
    expect(confirmOnPress).toBeDefined();

    confirmOnPress!();

    await waitFor(() => expect(mockLogoutAll).toHaveBeenCalledTimes(1));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/(auth)/login');
    alertSpy.mockRestore();
  });
});
