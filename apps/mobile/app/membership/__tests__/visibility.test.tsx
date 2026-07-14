/**
 * J108 · Üyelik paket görünürlük/erişim dilimi (membership/index) — J14 ile ÖRTÜŞMEZ.
 * Yalnız MOBİL-UI: kurumsal hesapta yalnız Business kartının görünmesi (geçersiz/uygunsuz
 * paketlerin UI'da gizlenmesi = geçersiz paket UI engeli), free kullanıcıda Business
 * kartının hiç render edilmemesi, bekleyen ödeme banner'ı ve checkout'a yönlendirme.
 * Abonelik tahsilatı/yetki (403) backendOnly.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { resetRouterMocks, pushMock } from '@/test-utils/router-mock';

jest.mock('expo-router', () => require('@/test-utils/router-mock').routerMock);

jest.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

let mockAuthState: any = { isAuthenticated: true, user: {} };
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => mockAuthState,
}));

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn() },
  membershipApi: { getCurrentMembership: jest.fn(), getTiers: jest.fn() },
}));
import { membershipApi } from '@/lib/api';
const mockGetMembership = membershipApi.getCurrentMembership as jest.Mock;
const mockGetTiers = membershipApi.getTiers as jest.Mock;

import MembershipScreen from '../index';

describe('J108 · üyelik paket görünürlük/erişim', () => {
  beforeEach(() => {
    resetRouterMocks();
    mockAuthState = { isAuthenticated: true, user: {} };
    mockGetMembership.mockResolvedValue({ data: { tier: { type: 'free', name: 'Ücretsiz' } } });
    mockGetTiers.mockResolvedValue({ data: [] });
  });

  it('J108.1 bireysel free hesapta Business kartı render edilmez', async () => {
    renderWithProviders(<MembershipScreen />);
    await waitFor(() => expect(screen.getByText('Temel')).toBeOnTheScreen());
    expect(screen.queryByText('Business')).toBeNull();
  });

  it('J108.2 kurumsal hesapta yalnız Business kartı görünür (diğer paketler gizli)', async () => {
    mockAuthState = {
      isAuthenticated: true,
      user: { companyName: 'Acme A.Ş.', taxId: '1234567890' },
    };
    renderWithProviders(<MembershipScreen />);
    await waitFor(() => expect(screen.getByText('Business')).toBeOnTheScreen());
    expect(screen.queryByText('Temel')).toBeNull();
    expect(screen.queryByText('Premium')).toBeNull();
  });

  it('J108.3 bekleyen ödeme varsa uyarı banner gösterilir', async () => {
    mockGetMembership.mockResolvedValue({
      data: {
        tier: { type: 'free', name: 'Ücretsiz' },
        pendingPayment: { id: 'pay1', tierType: 'premium', tierName: 'Premium' },
      },
    });
    renderWithProviders(<MembershipScreen />);
    await waitFor(() =>
      expect(screen.getByText('Ödeme Bekleniyor – Premium')).toBeOnTheScreen(),
    );
  });

  it('J108.4 bekleyen ödeme banner → checkout ekranına yönlendirir', async () => {
    mockGetMembership.mockResolvedValue({
      data: {
        tier: { type: 'free', name: 'Ücretsiz' },
        pendingPayment: { id: 'pay1', tierType: 'premium', tierName: 'Premium' },
      },
    });
    renderWithProviders(<MembershipScreen />);
    await waitFor(() =>
      expect(screen.getByText('Ödemeyi tamamlamak için dokunun')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByText('Ödemeyi tamamlamak için dokunun'));
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('/membership/checkout?tier=premium'),
    );
  });
});
