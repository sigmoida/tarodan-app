/**
 * J45 · E-posta doğrulama: süresi geçmiş/geçersiz token → hata ekranı,
 * manuel kod doğrulama, başarı durumu navigasyonu.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: (...a: unknown[]) => mockBack(...a) },
  useLocalSearchParams: () => mockParams,
}));

let mockAuth: { isAuthenticated: boolean; user: { email?: string } | null } = {
  isAuthenticated: false,
  user: null,
};
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

jest.mock('@/services/api', () => ({
  authApi: { verifyEmail: jest.fn(), resendVerification: jest.fn() },
}));
import { authApi } from '@/services/api';

import VerifyEmailScreen from '../verify-email';

const mockVerify = authApi.verifyEmail as jest.Mock;

describe('J45 · e-posta doğrulama (süresi geçmiş token)', () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockReplace.mockClear();
    mockBack.mockClear();
    mockParams = {};
    mockAuth = { isAuthenticated: false, user: null };
  });

  it('J45.1 deep-link token süresi dolmuş → "Doğrulama Başarısız" + backend mesajı', async () => {
    mockParams = { token: 'expired-token' };
    mockVerify.mockRejectedValue({
      response: { data: { message: 'Doğrulama bağlantısının süresi dolmuş.' } },
    });
    renderWithProviders(<VerifyEmailScreen />);

    await waitFor(() => expect(screen.getByText('Doğrulama Başarısız')).toBeOnTheScreen());
    expect(screen.getByText('Doğrulama bağlantısının süresi dolmuş.')).toBeOnTheScreen();
    expect(mockVerify).toHaveBeenCalledWith('expired-token');
  });

  it('J45.2 geçerli token → başarı ekranı, misafir ise giriş ekranına yönlendirir', async () => {
    mockParams = { token: 'good-token' };
    mockVerify.mockResolvedValue({});
    renderWithProviders(<VerifyEmailScreen />);

    await waitFor(() => expect(screen.getByText('E-postanız doğrulandı')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Devam Et'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('J45.3 token yokken idle: manuel kod boşken "Kodu Doğrula" disabled', () => {
    renderWithProviders(<VerifyEmailScreen />);
    expect(screen.getByText('Kodu Doğrula')).toBeDisabled();
  });

  it('J45.4 manuel kod girildi → verifyEmail trim edilmiş kod ile çağrılır', async () => {
    mockVerify.mockResolvedValue({});
    renderWithProviders(<VerifyEmailScreen />);
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], '  abc123  ');
    fireEvent.press(screen.getByText('Kodu Doğrula'));

    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith('abc123'));
  });

  it('J45.5 girişli kullanıcı + hata → "Yeni Bağlantı Gönder" butonu görünür', async () => {
    mockParams = { token: 'expired' };
    mockAuth = { isAuthenticated: true, user: { email: 'a@b.com' } };
    mockVerify.mockRejectedValue({ response: { data: { message: 'Süresi dolmuş.' } } });
    renderWithProviders(<VerifyEmailScreen />);

    await waitFor(() => expect(screen.getByText('Doğrulama Başarısız')).toBeOnTheScreen());
    expect(screen.getByText('Yeni Bağlantı Gönder')).toBeOnTheScreen();
  });
});
