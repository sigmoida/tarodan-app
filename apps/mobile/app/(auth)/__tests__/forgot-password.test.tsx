/**
 * J24 / J21-22 · Şifremi unuttum: nötr cevap mesajı (email var/yok ayrımı yapmaz),
 * email validasyonu + buton wiring + hata banner.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { resetRouterMocks, pushMock, backMock } from '@/test-utils/router-mock';

jest.mock('expo-router', () => require('@/test-utils/router-mock').routerMock);

jest.mock('@/services/api', () => ({
  authApi: { forgotPassword: jest.fn() },
}));
import { authApi } from '@/services/api';

import ForgotPasswordScreen from '../forgot-password';

const mockForgot = authApi.forgotPassword as jest.Mock;

describe('J24 · şifremi unuttum (nötr cevap)', () => {
  beforeEach(() => {
    mockForgot.mockReset();
    resetRouterMocks();
  });

  it('J24.1 geçersiz email → validasyon hatası, istek atılmaz', async () => {
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'gecersiz');
    fireEvent.press(screen.getByTestId('forgot-submit-button'));

    await waitFor(() => expect(screen.getByText('Geçerli email girin')).toBeOnTheScreen());
    expect(mockForgot).not.toHaveBeenCalled();
  });

  it('J24.2 başarılı istek → nötr "Email Gönderildi" mesajı gösterilir', async () => {
    mockForgot.mockResolvedValue({});
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'kayitli@b.com');
    fireEvent.press(screen.getByTestId('forgot-submit-button'));

    await waitFor(() => expect(screen.getByText('Email Gönderildi')).toBeOnTheScreen());
    expect(mockForgot).toHaveBeenCalledWith('kayitli@b.com');
  });

  it('J24.3 nötr mesaj: var olmayan email de aynı sonuç ekranını gösterir', async () => {
    // Backend nötr 200 döndürdüğü için UI email varlığına göre dallanmaz.
    mockForgot.mockResolvedValue({});
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'yok@b.com');
    fireEvent.press(screen.getByTestId('forgot-submit-button'));

    await waitFor(() => expect(screen.getByText('Email Gönderildi')).toBeOnTheScreen());
    // Sonuç ekranı: giriş sayfasına dönüş butonu render edilir
    expect(screen.getByText('Giriş Sayfasına Dön')).toBeOnTheScreen();
  });

  it('J24.4 istek hatası → hata banner görünür', async () => {
    mockForgot.mockRejectedValue(new Error('network'));
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'a@b.com');
    fireEvent.press(screen.getByTestId('forgot-submit-button'));

    await waitFor(() =>
      expect(screen.getByText('Bir hata oluştu. Lütfen tekrar deneyin.')).toBeOnTheScreen(),
    );
  });

  it('sonuç ekranı: "Giriş Sayfasına Dön" router.push çağırır', async () => {
    mockForgot.mockResolvedValue({});
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'a@b.com');
    fireEvent.press(screen.getByTestId('forgot-submit-button'));
    await waitFor(() => expect(screen.getByText('Giriş Sayfasına Dön')).toBeOnTheScreen());

    fireEvent.press(screen.getByText('Giriş Sayfasına Dön'));
    expect(pushMock).toHaveBeenCalledWith('/(auth)/login');
  });

  it('geri butonu router.back çağırır', () => {
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByText('Geri Dön'));
    expect(backMock).toHaveBeenCalled();
  });
});
