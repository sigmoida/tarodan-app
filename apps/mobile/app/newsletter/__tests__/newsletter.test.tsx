/**
 * J39/J117 · Bülten abone + abonelik iptali ekranları — mobil UI dilimi.
 * Abone formu: geçersiz e-posta reddi (Alert), boşken buton disable, geçerli
 * gönderimde subscribe çağrısı, iptal ekranına navigasyon.
 * Unsubscribe ekranı render + e-posta akışı çağrısı + başarı durumu render.
 * Backend abonelik kaydı / token doğrulama backend-only.
 */
import React from 'react';
import { appAlert } from '@tarodan/ui-native';
import { TextInput } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
import { router } from 'expo-router';
const mockPush = router.push as jest.Mock;
const mockReplace = router.replace as jest.Mock;

jest.mock('@/lib/api', () => ({
  guestApi: { post: jest.fn(), get: jest.fn() },
}));
import { guestApi } from '@/lib/api';

import NewsletterScreen from '../index';
import NewsletterUnsubscribeScreen from '../unsubscribe';

const postMock = guestApi.post as jest.Mock;
const getMock = guestApi.get as jest.Mock;

describe('J39 · Bülten abone (newsletter)', () => {
  let alertSpy: jest.Mock;
  beforeEach(() => {
    postMock.mockReset();
    mockPush.mockReset();
    mockParams = {};
    alertSpy = (appAlert as jest.Mock).mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('J39.1 e-posta boşken "Abone Ol" butonu disable', () => {
    renderWithProviders(<NewsletterScreen />);
    expect(screen.getByText('Abone Ol')).toBeDisabled();
  });

  it('J39.2 geçersiz e-posta → Alert ile reddedilir, API çağrılmaz', () => {
    renderWithProviders(<NewsletterScreen />);
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], 'gecersiz');
    fireEvent.press(screen.getByText('Abone Ol'));
    expect(alertSpy).toHaveBeenCalledWith('Eksik', 'Geçerli bir e-posta girin.');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('J39.3 geçerli e-posta → subscribe çağrılır', async () => {
    postMock.mockResolvedValue({ data: {} });
    renderWithProviders(<NewsletterScreen />);
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], 'Ali@Test.com');
    fireEvent.press(screen.getByText('Abone Ol'));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/newsletter/subscribe', {
        email: 'ali@test.com',
        newsletter: true,
      }),
    );
  });

  it('J39.4 "Aboneliğimi İptal Etmek İstiyorum" iptal ekranına yönlendirir', () => {
    renderWithProviders(<NewsletterScreen />);
    fireEvent.press(screen.getByText('Aboneliğimi İptal Etmek İstiyorum'));
    expect(mockPush).toHaveBeenCalledWith('/newsletter/unsubscribe');
  });
});

describe('J117 · Bülten abonelik iptali (unsubscribe)', () => {
  let alertSpy: jest.Mock;
  beforeEach(() => {
    postMock.mockReset();
    getMock.mockReset();
    mockReplace.mockReset();
    mockParams = {};
    alertSpy = (appAlert as jest.Mock).mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('J117.1 token yokken e-posta giriş formu render edilir', () => {
    renderWithProviders(<NewsletterUnsubscribeScreen />);
    expect(screen.getByText('Bülten Aboneliğini İptal Et')).toBeOnTheScreen();
    expect(screen.getByText('Aboneliğimi İptal Et')).toBeDisabled();
  });

  it('J117.2 geçersiz e-posta → Alert ile reddedilir', () => {
    renderWithProviders(<NewsletterUnsubscribeScreen />);
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], 'gecersiz');
    fireEvent.press(screen.getByText('Aboneliğimi İptal Et'));
    expect(alertSpy).toHaveBeenCalledWith('Eksik', 'Geçerli bir e-posta girin.');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('J117.3 geçerli e-posta → unsubscribe POST çağrılır ve başarı ekranı render', async () => {
    postMock.mockResolvedValue({ data: { success: true } });
    renderWithProviders(<NewsletterUnsubscribeScreen />);
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], 'Ali@Test.com');
    fireEvent.press(screen.getByText('Aboneliğimi İptal Et'));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/newsletter/unsubscribe', { email: 'ali@test.com' }),
    );
    expect(await screen.findByText('Aboneliğiniz İptal Edildi')).toBeOnTheScreen();
  });

  it('J117.4 token paramı varsa otomatik GET ile iptal denenir', async () => {
    mockParams = { token: 'abc123' };
    getMock.mockResolvedValue({ data: { success: true } });
    renderWithProviders(<NewsletterUnsubscribeScreen />);
    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith('/newsletter/unsubscribe?token=abc123'),
    );
  });
});
