/**
 * J15/J105 · Koleksiyon oluştur formu — mobil UI dilimi.
 * Premium gate (canCreateCollections), form alanları render, ad zorunlu (en az 3 karakter)
 * validasyon hatası, public toggle, gönder butonu wiring (api.post çağrıldı mı).
 * Backend: oluşturma kalıcılığı, kapak multipart yükleme backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { resetRouterMocks } from '@/test-utils/router-mock';

jest.mock('expo-router', () => require('@/test-utils/router-mock').routerMock);

jest.mock('@/lib/api', () => ({
  api: { post: jest.fn(), patch: jest.fn() },
}));
import { api } from '@/lib/api';

let mockAuth: Record<string, unknown> = {
  isAuthenticated: true,
  limits: { canCreateCollections: true },
};
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

import NewCollectionScreen from '../new';

const postMock = api.post as jest.Mock;

describe('J15 · Koleksiyon oluştur formu (mobil)', () => {
  beforeEach(() => {
    postMock.mockReset();
    resetRouterMocks();
    mockAuth = { isAuthenticated: true, limits: { canCreateCollections: true } };
  });

  it('J15.1 form alanları render edilir (ad, açıklama, herkese açık toggle)', () => {
    renderWithProviders(<NewCollectionScreen />);
    expect(screen.getByText('Koleksiyon Adı *')).toBeOnTheScreen();
    expect(screen.getByText('Açıklama')).toBeOnTheScreen();
    expect(screen.getByText('Herkese Açık')).toBeOnTheScreen();
    expect(screen.getByText('Koleksiyon Oluştur')).toBeOnTheScreen();
  });

  it('J15.2 adsız (boş) gönderim → validasyon hatası, api.post çağrılmaz', async () => {
    renderWithProviders(<NewCollectionScreen />);
    fireEvent.press(screen.getByText('Koleksiyon Oluştur'));
    await waitFor(() =>
      expect(screen.getByText('Koleksiyon adı en az 3 karakter olmalı')).toBeOnTheScreen(),
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it('J15.3 geçerli ad ile gönderim → api.post /collections çağrılır', async () => {
    postMock.mockResolvedValue({ data: { id: 'col-1' } });
    renderWithProviders(<NewCollectionScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText('örn: Ferrari 1:18 Koleksiyonum'),
      'Ferrari Koleksiyonum',
    );
    fireEvent.press(screen.getByText('Koleksiyon Oluştur'));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(
        '/collections',
        expect.objectContaining({ name: 'Ferrari Koleksiyonum', isPublic: true }),
      ),
    );
  });

  it('J105.1 premium değilse upsell ekranı gösterilir, form gizli', () => {
    mockAuth = { isAuthenticated: true, limits: { canCreateCollections: false } };
    renderWithProviders(<NewCollectionScreen />);
    expect(screen.getByText("Premium'a Yükselt")).toBeOnTheScreen();
    expect(screen.queryByText('Koleksiyon Oluştur')).toBeNull();
  });
});
