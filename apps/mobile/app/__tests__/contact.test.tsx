/**
 * J116 · İletişim ekranı — mobil UI dilimi.
 * Boş/kısa mesaj reddi (snackbar validasyonu), geçerli form gönderiminde
 * guestContact çağrısı + başarı snackbar, FAQ navigasyonu.
 * Backend mesaj işleme/e-posta backend-only.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));
import { router } from 'expo-router';
const mockPush = router.push as jest.Mock;

jest.mock('@/services/api', () => ({
  supportApi: { guestContact: jest.fn() },
}));
import { supportApi } from '@/services/api';

jest.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import ContactScreen from '../contact';

const guestContactMock = supportApi.guestContact as jest.Mock;

/** Form input'larını sırasıyla doldurur: Adınız, E-posta, Konu, Mesajınız. */
function fillForm(values: { name: string; email: string; subject: string; message: string }) {
  const inputs = screen.UNSAFE_getAllByType(TextInput);
  fireEvent.changeText(inputs[0], values.name);
  fireEvent.changeText(inputs[1], values.email);
  fireEvent.changeText(inputs[2], values.subject);
  fireEvent.changeText(inputs[3], values.message);
}

describe('J116 · İletişim (contact)', () => {
  beforeEach(() => {
    guestContactMock.mockReset();
    mockPush.mockReset();
  });

  it('J116.1 boş form gönderiminde uyarı snackbar gösterilir, API çağrılmaz', async () => {
    renderWithProviders(<ContactScreen />);
    fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText('Lütfen tüm alanları doldurun')).toBeOnTheScreen();
    expect(guestContactMock).not.toHaveBeenCalled();
  });

  it('J116.2 mesaj 10 karakterden kısa → reddedilir', async () => {
    renderWithProviders(<ContactScreen />);
    fillForm({ name: 'Ali', email: 'ali@test.com', subject: 'Soru', message: 'kısa' });
    fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText('Mesaj en az 10 karakter olmalıdır.')).toBeOnTheScreen();
    expect(guestContactMock).not.toHaveBeenCalled();
  });

  it('J116.3 geçersiz e-posta → reddedilir', async () => {
    renderWithProviders(<ContactScreen />);
    fillForm({ name: 'Ali', email: 'gecersiz', subject: 'Soru', message: 'Bu yeterince uzun bir mesaj.' });
    fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText('Geçerli bir e-posta adresi girin.')).toBeOnTheScreen();
    expect(guestContactMock).not.toHaveBeenCalled();
  });

  it('J116.4 geçerli form → guestContact çağrılır ve başarı snackbar', async () => {
    guestContactMock.mockResolvedValue({});
    renderWithProviders(<ContactScreen />);
    fillForm({ name: 'Ali Veli', email: 'ali@test.com', subject: 'Soru', message: 'Bu yeterince uzun bir mesaj.' });
    fireEvent.press(screen.getByText('Gönder'));
    await waitFor(() =>
      expect(guestContactMock).toHaveBeenCalledWith({
        name: 'Ali Veli',
        email: 'ali@test.com',
        subject: 'Soru',
        message: 'Bu yeterince uzun bir mesaj.',
      }),
    );
    expect(await screen.findByText('Mesajınız gönderildi!')).toBeOnTheScreen();
  });

  it('J116.5 SSS bağlantısı /help ekranına yönlendirir', () => {
    renderWithProviders(<ContactScreen />);
    fireEvent.press(screen.getByText('Sık Sorulan Sorular'));
    expect(mockPush).toHaveBeenCalledWith('/help');
  });
});
