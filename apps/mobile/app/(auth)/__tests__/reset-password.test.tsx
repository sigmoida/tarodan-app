/**
 * J46 · Yeni şifre belirle: zayıf şifre validasyonu, eşleşmeme,
 * eksik token, buton enable/disable, başarı ekranı.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

const inputs = () => screen.UNSAFE_getAllByType(TextInput);
const setPasswords = (pw: string, confirm: string) => {
  const [pwInput, confirmInput] = inputs();
  fireEvent.changeText(pwInput, pw);
  fireEvent.changeText(confirmInput, confirm);
};

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, unknown> = { token: 'valid-token' };

jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: (...a: unknown[]) => mockBack(...a) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../../src/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../src/services/api', () => ({
  authApi: { resetPassword: jest.fn() },
}));
import { authApi } from '../../../src/services/api';

import ResetPasswordScreen from '../reset-password';

const mockReset = authApi.resetPassword as jest.Mock;

const STRONG = 'Abcdef12';

describe('J46 · şifre sıfırlama (zayıf şifre)', () => {
  beforeEach(() => {
    mockReset.mockReset();
    mockReplace.mockClear();
    mockBack.mockClear();
    mockParams = { token: 'valid-token' };
  });

  it('J46.1 her iki alan boşken submit butonu disabled', () => {
    renderWithProviders(<ResetPasswordScreen />);
    expect(screen.getByText('mobile.resetPasswordButton')).toBeDisabled();
  });

  it('J46.2 zayıf şifre (8 karakterden kısa) → hata, istek atılmaz', async () => {
    renderWithProviders(<ResetPasswordScreen />);
    setPasswords('Ab1', 'Ab1');
    fireEvent.press(screen.getByText('mobile.resetPasswordButton'));

    await waitFor(() =>
      expect(screen.getByText('Şifre en az 8 karakter olmalıdır')).toBeOnTheScreen(),
    );
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('J46.3 büyük harf eksik → ilgili hata', async () => {
    renderWithProviders(<ResetPasswordScreen />);
    setPasswords('abcdef12', 'abcdef12');
    fireEvent.press(screen.getByText('mobile.resetPasswordButton'));

    await waitFor(() =>
      expect(screen.getByText('Şifre en az bir büyük harf içermelidir')).toBeOnTheScreen(),
    );
  });

  it('J46.4 şifreler eşleşmiyor → hata, istek atılmaz', async () => {
    renderWithProviders(<ResetPasswordScreen />);
    setPasswords(STRONG, 'Abcdef99');
    fireEvent.press(screen.getByText('mobile.resetPasswordButton'));

    await waitFor(() => expect(screen.getByText('Şifreler eşleşmiyor')).toBeOnTheScreen());
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('J46.5 eksik token → token hatası, istek atılmaz', async () => {
    mockParams = {};
    renderWithProviders(<ResetPasswordScreen />);
    setPasswords(STRONG, STRONG);
    fireEvent.press(screen.getByText('mobile.resetPasswordButton'));

    await waitFor(() =>
      expect(
        screen.getByText(/Geçersiz veya eksik token/),
      ).toBeOnTheScreen(),
    );
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('J46.6 güçlü ve eşleşen şifre → resetPassword çağrılır, başarı ekranı', async () => {
    mockReset.mockResolvedValue({});
    renderWithProviders(<ResetPasswordScreen />);
    setPasswords(STRONG, STRONG);
    fireEvent.press(screen.getByText('mobile.resetPasswordButton'));

    await waitFor(() =>
      expect(screen.getByText('Şifre Başarıyla Değiştirildi!')).toBeOnTheScreen(),
    );
    expect(mockReset).toHaveBeenCalledWith('valid-token', STRONG);
  });

  it('J46.7 backend hata mesajı → ekranda gösterilir', async () => {
    mockReset.mockRejectedValue({ response: { data: { message: 'Token süresi doldu' } } });
    renderWithProviders(<ResetPasswordScreen />);
    setPasswords(STRONG, STRONG);
    fireEvent.press(screen.getByText('mobile.resetPasswordButton'));

    await waitFor(() => expect(screen.getByText('Token süresi doldu')).toBeOnTheScreen());
  });
});
