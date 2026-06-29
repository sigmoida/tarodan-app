/**
 * J14 · Üyelik başarı ekranı (membership/success).
 * Bulgu #14 regresyonu: ekran daima "Premium" yazıyordu; `?tier=` paramı yok
 * sayılıyordu. Burada içerik kademeye göre uyarlanıyor mu doğrulanır.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';
import { resetRouterMocks } from '../../../src/test-utils/router-mock';

let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  ...require('../../../src/test-utils/router-mock').routerMock,
  useLocalSearchParams: () => mockParams,
}));

const mockRefreshUserData = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => ({ refreshUserData: mockRefreshUserData }),
}));

jest.mock('../../../src/services/api', () => ({
  paymentsApi: { verify: jest.fn().mockResolvedValue({ data: { completed: true } }) },
}));

import MembershipSuccessScreen from '../success';

describe('J14 · üyelik başarı ekranı (membership/success)', () => {
  beforeEach(() => {
    resetRouterMocks();
    mockRefreshUserData.mockClear();
    mockParams = {};
  });

  it('J14.S1 tier=business → "Business" gösterir, "Premium" yazmaz', async () => {
    mockParams = { tier: 'business', paymentId: 'pay1' };
    renderWithProviders(<MembershipSuccessScreen />);
    await waitFor(() =>
      expect(screen.getByText(/Business üyeliğiniz başarıyla aktifleştirildi/)).toBeOnTheScreen(),
    );
    expect(screen.queryByText(/Premium üyeliğiniz/)).toBeNull();
    // Kademeye özel özellik
    expect(screen.getByText('API erişimi')).toBeOnTheScreen();
  });

  it('J14.S2 tier=basic → "Temel" gösterir', async () => {
    mockParams = { tier: 'basic', paymentId: 'pay1' };
    renderWithProviders(<MembershipSuccessScreen />);
    await waitFor(() =>
      expect(screen.getByText(/Temel üyeliğiniz başarıyla aktifleştirildi/)).toBeOnTheScreen(),
    );
    expect(screen.getByText('15 ücretsiz ilan')).toBeOnTheScreen();
  });

  it('J14.S3 tier eksik/bilinmeyen → premium fallback', async () => {
    mockParams = { paymentId: 'pay1' };
    renderWithProviders(<MembershipSuccessScreen />);
    await waitFor(() =>
      expect(screen.getByText(/Premium üyeliğiniz başarıyla aktifleştirildi/)).toBeOnTheScreen(),
    );
  });
});
