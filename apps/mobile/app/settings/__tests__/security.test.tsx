/**
 * Regression testi — 2FA toggle gerçek durumu SUNUCUDAN okumalı.
 * Bug (düzeltildi): ekran var olmayan user.twoFactorEnabled alanına bakıyordu;
 * artık mockGetTwoFactorStatus() ile TwoFactorSecret.isEnabled'ı çekiyor.
 * Strateji: docs/superpowers/specs/mobile-test-strategy.md
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import SecuritySettingsScreen from '../security';

// expo-router
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

// Oturum açık kullanıcı
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true, logout: jest.fn() }),
}));

// i18n — anahtarı aynen döndür
jest.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// API — mock fn'leri factory İÇİNDE tanımla (out-of-scope ref yok), sonra import et.
jest.mock('@/services/api', () => ({
  authApi: {
    getTwoFactorStatus: jest.fn(),
    setupTwoFactor: jest.fn(),
    verifyTwoFactor: jest.fn(),
    disableTwoFactor: jest.fn(),
    regenerateBackupCodes: jest.fn(),
    changePassword: jest.fn(),
    logoutAll: jest.fn(),
  },
}));
import { authApi } from '@/services/api';
const mockGetTwoFactorStatus = authApi.getTwoFactorStatus as jest.Mock;

describe('SecuritySettingsScreen — 2FA durumu', () => {
  beforeEach(() => mockGetTwoFactorStatus.mockReset());

  it('sunucu isEnabled:true dönerse toggle "Aktif" gösterir', async () => {
    mockGetTwoFactorStatus.mockResolvedValue({ data: { isEnabled: true } });
    render(<SecuritySettingsScreen />);
    await waitFor(() => expect(screen.getByText('Aktif')).toBeOnTheScreen());
    expect(mockGetTwoFactorStatus).toHaveBeenCalledTimes(1);
  });

  it('sunucu isEnabled:false dönerse toggle "Devre dışı" gösterir', async () => {
    mockGetTwoFactorStatus.mockResolvedValue({ data: { isEnabled: false } });
    render(<SecuritySettingsScreen />);
    await waitFor(() => expect(screen.getByText('Devre dışı')).toBeOnTheScreen());
  });
});
