/**
 * Yardım Merkezi ekranı — iletişim formu dilimi.
 * Önceden form mock'tu: hiçbir API çağrısı yapmadan "gönderildi" diyordu (Bulgu #5).
 * Bu testler formun gerçekten supportApi.guestContact'a POST attığını, validasyonun
 * backend GuestContactDto ile paritede olduğunu ve hata yolunun kullanıcıya
 * bildirildiğini doğrular.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));

jest.mock('@/lib/api', () => ({
  supportApi: { guestContact: jest.fn(), createTicket: jest.fn() },
}));
import { supportApi } from '@/lib/api';

let mockIsAuthenticated = false;
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

jest.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import HelpScreen from '../help';

const guestContactMock = supportApi.guestContact as jest.Mock;
const createTicketMock = supportApi.createTicket as jest.Mock;

/**
 * Help ekranındaki TextInput sırası: [0] arama, [1] Adınız, [2] E-posta, [3] Mesajınız.
 * İletişim formu alanlarını doldurur.
 */
function fillForm(values: { name: string; email: string; message: string }) {
  const inputs = screen.UNSAFE_getAllByType(TextInput);
  fireEvent.changeText(inputs[1], values.name);
  fireEvent.changeText(inputs[2], values.email);
  fireEvent.changeText(inputs[3], values.message);
}

describe('Yardım Merkezi · iletişim formu', () => {
  beforeEach(() => {
    guestContactMock.mockReset();
    createTicketMock.mockReset();
    mockIsAuthenticated = false;
  });

  it('boş form gönderiminde uyarı snackbar gösterilir, API çağrılmaz', async () => {
    renderWithProviders(<HelpScreen />);
    fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText('Lütfen tüm alanları doldurun')).toBeOnTheScreen();
    expect(guestContactMock).not.toHaveBeenCalled();
  });

  it('mesaj 10 karakterden kısa → reddedilir', async () => {
    renderWithProviders(<HelpScreen />);
    fillForm({ name: 'Ali', email: 'ali@test.com', message: 'kısa' });
    fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText('Mesaj en az 10 karakter olmalıdır.')).toBeOnTheScreen();
    expect(guestContactMock).not.toHaveBeenCalled();
  });

  it('geçersiz e-posta → reddedilir', async () => {
    renderWithProviders(<HelpScreen />);
    fillForm({ name: 'Ali', email: 'gecersiz', message: 'Bu yeterince uzun bir mesaj.' });
    fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText('Geçerli bir e-posta adresi girin')).toBeOnTheScreen();
    expect(guestContactMock).not.toHaveBeenCalled();
  });

  it('misafir geçerli form → guestContact çağrılır ve başarı snackbar', async () => {
    guestContactMock.mockResolvedValue({});
    renderWithProviders(<HelpScreen />);
    fillForm({ name: 'Ali Veli', email: 'ali@test.com', message: 'Bu yeterince uzun bir mesaj.' });
    fireEvent.press(screen.getByText('Gönder'));
    await waitFor(() =>
      expect(guestContactMock).toHaveBeenCalledWith({
        name: 'Ali Veli',
        email: 'ali@test.com',
        message: 'Bu yeterince uzun bir mesaj.',
      }),
    );
    expect(await screen.findByText(/Mesajınız gönderildi!/)).toBeOnTheScreen();
    expect(createTicketMock).not.toHaveBeenCalled();
  });

  it('giriş yapmış kullanıcı geçerli form → takip edilebilir createTicket çağrılır', async () => {
    mockIsAuthenticated = true;
    createTicketMock.mockResolvedValue({ data: { ticketNumber: 'TKT-1' } });
    renderWithProviders(<HelpScreen />);
    fillForm({ name: 'Ali Veli', email: 'ali@test.com', message: 'Bu yeterince uzun bir mesaj.' });
    fireEvent.press(screen.getByText('Gönder'));
    await waitFor(() =>
      expect(createTicketMock).toHaveBeenCalledWith({
        subject: 'Yardım Merkezi mesajı',
        category: 'other',
        message: 'Bu yeterince uzun bir mesaj.',
      }),
    );
    expect(guestContactMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/Destek talebiniz oluşturuldu!/)).toBeOnTheScreen();
  });

  it('API hatası → kullanıcıya hata snackbar gösterilir', async () => {
    guestContactMock.mockRejectedValue(new Error('network'));
    renderWithProviders(<HelpScreen />);
    fillForm({ name: 'Ali Veli', email: 'ali@test.com', message: 'Bu yeterince uzun bir mesaj.' });
    fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText('Mesaj gönderilemedi, lütfen tekrar deneyin.')).toBeOnTheScreen();
  });
});
