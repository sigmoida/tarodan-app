/**
 * J119 · Satıcı takip/takipten çıkma.
 * Mobil-UI dilimi: boş durum render'ı, takip listesi render'ı,
 * "Takibi Bırak" butonu store.unfollowSeller'ı çağırır (wiring).
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../src/test-utils';

jest.mock('expo-router', () => ({
  ...require('../../src/test-utils/router-mock').routerMock,
  useFocusEffect: jest.fn(),
}));

jest.mock('../../src/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}));

const fetchFollowing = jest.fn();
const unfollowSeller = jest.fn();
let mockState: any;

jest.mock('../../src/hooks/useFollowing', () => ({
  useFollowing: () => mockState,
}));

import FollowingScreen from '../following';

describe('J119 · takip ettiklerim', () => {
  beforeEach(() => {
    fetchFollowing.mockClear();
    unfollowSeller.mockClear();
    mockState = {
      following: [],
      isLoading: false,
      fetchFollowing,
      unfollowSeller,
      getFollowingCount: () => 0,
    };
  });

  it('J119.1 hiç takip yoksa boş durum mesajı görünür', () => {
    renderWithProviders(<FollowingScreen />);
    expect(screen.getByText('Henüz kimseyi takip etmiyorsunuz')).toBeOnTheScreen();
  });

  it('J119.2 takip edilen satıcı listede render olur', () => {
    mockState.following = [
      { id: 's1', displayName: 'Ahmet Satıcı', listingCount: 5, followedAt: '2026-01-01T00:00:00Z' },
    ];
    mockState.getFollowingCount = () => 1;
    renderWithProviders(<FollowingScreen />);
    expect(screen.getByText('Ahmet Satıcı')).toBeOnTheScreen();
    expect(screen.getByText('5 ilan')).toBeOnTheScreen();
  });

  it('J119.3 "Takibi Bırak" butonu unfollowSeller(id) çağırır', async () => {
    mockState.following = [
      { id: 's1', displayName: 'Ahmet Satıcı', listingCount: 5, followedAt: '2026-01-01T00:00:00Z' },
    ];
    mockState.getFollowingCount = () => 1;
    renderWithProviders(<FollowingScreen />);
    fireEvent.press(screen.getByText('Takibi Bırak'));
    await waitFor(() => expect(unfollowSeller).toHaveBeenCalledWith('s1'));
  });
});
