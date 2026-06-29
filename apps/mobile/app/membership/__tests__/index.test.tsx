/**
 * J14 · Üyelik paket listesi ekranı (membership/index).
 * Yalnız MOBİL-UI: paket kartlarının render'ı, mevcut plan rozeti, aylık/yıllık
 * toggle, yükselt butonu → checkout navigasyon wiring.
 * Backend abonelik/tahsilat backendOnly.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';
import { resetRouterMocks, pushMock } from '../../../src/test-utils/router-mock';

jest.mock('expo-router', () => require('../../../src/test-utils/router-mock').routerMock);

jest.mock('../../../src/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

let mockAuthState: any = { isAuthenticated: true, user: {} };
jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => mockAuthState,
}));

jest.mock('../../../src/services/api', () => ({
  api: { get: jest.fn() },
  membershipApi: { getCurrentMembership: jest.fn(), getTiers: jest.fn() },
}));
import { membershipApi } from '../../../src/services/api';
const mockGetMembership = membershipApi.getCurrentMembership as jest.Mock;
const mockGetTiers = membershipApi.getTiers as jest.Mock;

import MembershipScreen from '../index';

describe('J14 · üyelik paket listesi (membership/index)', () => {
  beforeEach(() => {
    resetRouterMocks();
    mockAuthState = { isAuthenticated: true, user: {} };
    mockGetMembership.mockResolvedValue({ data: { tier: { type: 'free', name: 'Ücretsiz' } } });
    mockGetTiers.mockResolvedValue({ data: [] });
  });

  it('J14.1 yüklendikten sonra paket kartları render edilir (Temel/Premium)', async () => {
    renderWithProviders(<MembershipScreen />);
    await waitFor(() => expect(screen.getByText('Temel')).toBeOnTheScreen());
    expect(screen.getByText('Premium')).toBeOnTheScreen();
    // Free kullanıcı için mevcut plan özeti
    expect(screen.getByText('Mevcut Planınız')).toBeOnTheScreen();
  });

  it('J14.2 aylık/yıllık toggle render edilir', async () => {
    renderWithProviders(<MembershipScreen />);
    await waitFor(() => expect(screen.getByText('Aylık')).toBeOnTheScreen());
    expect(screen.getByText('Yıllık')).toBeOnTheScreen();
  });

  it('J14.3 "Yükselt" → checkout ekranına tier+period ile yönlendirir', async () => {
    renderWithProviders(<MembershipScreen />);
    await waitFor(() => expect(screen.getAllByText('Yükselt').length).toBeGreaterThan(0));
    fireEvent.press(screen.getAllByText('Yükselt')[0]);
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('/membership/checkout?tier='),
    );
  });

  it('J14.4 her iki istek de reddedilirse hata banner gösterilir', async () => {
    mockGetMembership.mockRejectedValue(new Error('net'));
    mockGetTiers.mockRejectedValue(new Error('net'));
    renderWithProviders(<MembershipScreen />);
    await waitFor(() =>
      expect(screen.getByText('Üyelik bilgileri yüklenemedi. Lütfen tekrar deneyin.')).toBeOnTheScreen(),
    );
  });
});
