/**
 * J126 · CMS statik sayfa (slug) — mobil UI dilimi.
 * Sayfa başlığı render (ScreenHeader), var olmayan slug (404) → "Sayfa bulunamadı.",
 * diğer yükleme hataları → "Sayfa yüklenirken bir hata oluştu.".
 * İçerik HTML'i WebView içinde render edildiğinden (görsel), backend içerik gövdesi backend-only.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

let mockParams: Record<string, string> = { slug: 'gizlilik' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { canGoBack: jest.fn(() => false), back: jest.fn(), replace: jest.fn() },
}));

// WebView görseli text olarak query edilemez; basit stub yeterli.
jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

jest.mock('@/services/api', () => ({
  pagesApi: { getBySlug: jest.fn() },
}));
import { pagesApi } from '@/services/api';

import CMSPageScreen from '../[slug]';

const getBySlugMock = pagesApi.getBySlug as jest.Mock;

describe('J126 · CMS statik sayfa (slug)', () => {
  beforeEach(() => {
    getBySlugMock.mockReset();
    mockParams = { slug: 'gizlilik' };
  });

  it('J126.1 sayfa başlığı header\'da görünür', async () => {
    getBySlugMock.mockResolvedValue({
      data: { data: { id: 'p1', slug: 'gizlilik', title: 'Gizlilik Politikası', content: '<p>İçerik</p>' } },
    });
    renderWithProviders(<CMSPageScreen />);
    await waitFor(() =>
      expect(screen.getByText('Gizlilik Politikası')).toBeOnTheScreen(),
    );
  });

  it('J126.2 var olmayan slug (404) → "Sayfa bulunamadı."', async () => {
    getBySlugMock.mockRejectedValue({ response: { status: 404 } });
    renderWithProviders(<CMSPageScreen />);
    expect(await screen.findByText('Sayfa bulunamadı.')).toBeOnTheScreen();
  });

  it('J126.3 yükleme hatası (404 dışı) → "Sayfa yüklenirken bir hata oluştu."', async () => {
    getBySlugMock.mockRejectedValue(new Error('500'));
    renderWithProviders(<CMSPageScreen />);
    expect(await screen.findByText('Sayfa yüklenirken bir hata oluştu.')).toBeOnTheScreen();
  });
});
