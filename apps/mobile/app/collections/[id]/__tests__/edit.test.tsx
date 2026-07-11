/**
 * J30 · Koleksiyon düzenle formu — mobil UI dilimi.
 * Form mevcut değerlerle dolar (reset), validasyon (ad min 3), kaydet wiring (api.patch),
 * sahiplik: yabancıda "düzenleme yetkiniz yok" ekranı.
 * Backend: güncelleme/silme kalıcılığı, kapak multipart, item kaldırma backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

let mockParams: Record<string, string> = { id: 'col-1' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));

jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
import { api } from '@/services/api';

let mockAuth: Record<string, unknown> = { user: { id: 'owner-1' } };
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

import EditCollectionScreen from '../edit';

const getMock = api.get as jest.Mock;
const patchMock = api.patch as jest.Mock;

function collectionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'col-1',
    name: 'Vintage Arabalar',
    slug: 'vintage',
    description: 'Eski güzel günler',
    coverImageUrl: null,
    isPublic: true,
    viewCount: 10,
    likeCount: 3,
    userId: 'owner-1',
    items: [],
    createdAt: new Date('2026-01-01').toISOString(),
    ...overrides,
  };
}

describe('J30 · Koleksiyon düzenle formu (mobil)', () => {
  beforeEach(() => {
    getMock.mockReset();
    patchMock.mockReset();
    mockParams = { id: 'col-1' };
    mockAuth = { user: { id: 'owner-1' } };
  });

  it('J30.5 form mevcut koleksiyon değerleriyle dolar', async () => {
    getMock.mockResolvedValue({ data: collectionFixture() });
    renderWithProviders(<EditCollectionScreen />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('Vintage Arabalar')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Değişiklikleri Kaydet')).toBeOnTheScreen();
  });

  it('J30.6 adı geçersiz (kısa) yapınca validasyon hatası, api.patch çağrılmaz', async () => {
    getMock.mockResolvedValue({ data: collectionFixture() });
    renderWithProviders(<EditCollectionScreen />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('Vintage Arabalar')).toBeOnTheScreen(),
    );
    fireEvent.changeText(screen.getByDisplayValue('Vintage Arabalar'), 'ab');
    fireEvent.press(screen.getByText('Değişiklikleri Kaydet'));
    await waitFor(() =>
      expect(screen.getByText('Koleksiyon adı en az 3 karakter olmalı')).toBeOnTheScreen(),
    );
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('J30.7 geçerli değişiklik → api.patch /collections/:id çağrılır', async () => {
    getMock.mockResolvedValue({ data: collectionFixture() });
    patchMock.mockResolvedValue({});
    renderWithProviders(<EditCollectionScreen />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('Vintage Arabalar')).toBeOnTheScreen(),
    );
    fireEvent.changeText(screen.getByDisplayValue('Vintage Arabalar'), 'Vintage Klasikler');
    fireEvent.press(screen.getByText('Değişiklikleri Kaydet'));
    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith(
        '/collections/col-1',
        expect.objectContaining({ name: 'Vintage Klasikler' }),
      ),
    );
  });

  it('J106.3 yabancı kullanıcıda düzenleme yetkisi yok ekranı', async () => {
    mockAuth = { user: { id: 'stranger-9' } };
    getMock.mockResolvedValue({ data: collectionFixture({ userId: 'owner-1' }) });
    renderWithProviders(<EditCollectionScreen />);
    expect(
      await screen.findByText('Bu koleksiyonu düzenleme yetkiniz yok'),
    ).toBeOnTheScreen();
  });
});
