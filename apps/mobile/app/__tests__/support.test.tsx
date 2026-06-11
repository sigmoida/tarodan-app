/**
 * J20/J115 · Destek talebi ekranı — mobil UI dilimi.
 * Giriş gerekli durumu + login navigasyonu, kimliği doğrulanmış formda buton
 * disable/enable (kategori+konu+açıklama), iletişim bilgisi render.
 * Backend talep oluşturma (ticket) backend-only.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { screen, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../src/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));
import { router } from 'expo-router';
const mockPush = router.push as jest.Mock;
const mockBack = router.back as jest.Mock;

let mockAuth: { isAuthenticated: boolean; user: any } = {
  isAuthenticated: true,
  user: { displayName: 'Ayşe', email: 'ayse@test.com' },
};
jest.mock('../../src/stores/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

jest.mock('../../src/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import SupportScreen from '../support';

describe('J20 · Destek talebi (support)', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
    mockAuth = {
      isAuthenticated: true,
      user: { displayName: 'Ayşe', email: 'ayse@test.com' },
    };
  });

  it('J20.1 giriş yapılmamışsa "Giriş Gerekli" + login navigasyonu', () => {
    mockAuth = { isAuthenticated: false, user: null };
    renderWithProviders(<SupportScreen />);
    expect(screen.getByText('Giriş Gerekli')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Giriş Yap'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('J20.2 kimliği doğrulanmış kullanıcıya form ve iletişim bilgisi gösterilir', () => {
    renderWithProviders(<SupportScreen />);
    expect(screen.getByText('Kategori Seçin')).toBeOnTheScreen();
    expect(screen.getByText('ayse@test.com')).toBeOnTheScreen();
    expect(screen.getByText('Ayşe')).toBeOnTheScreen();
  });

  it('J20.3 zorunlu alanlar boşken "Talep Oluştur" butonu disable', () => {
    renderWithProviders(<SupportScreen />);
    expect(screen.getByText('Talep Oluştur')).toBeDisabled();
  });

  it('J20.4 kategori+konu+açıklama dolunca buton aktifleşir', () => {
    renderWithProviders(<SupportScreen />);
    // kategori seç
    fireEvent.press(screen.getByText('Hesap Sorunu'));
    // alanları doldur (Konu, Açıklama) — bu kategoride orderId input'u yok
    const inputs = screen.UNSAFE_getAllByType(TextInput);
    fireEvent.changeText(inputs[0], 'Hesabıma giremiyorum');
    fireEvent.changeText(inputs[1], 'Şifre sıfırlama maili gelmiyor.');
    expect(screen.getByText('Talep Oluştur')).not.toBeDisabled();
  });
});
