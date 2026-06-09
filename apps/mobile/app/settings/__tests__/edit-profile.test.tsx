/**
 * J118 · Profil düzenleme (mobil-UI dilimi).
 * Bio karakter sayacı (0/500) yazıldıkça güncellenir; displayName < 2 karakter →
 * validasyon hatası, updateProfile (api) çağrılmaz.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

jest.mock('expo-router', () => require('../../../src/test-utils/router-mock').routerMock);

jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { displayName: 'Test', email: 't@b.com', membershipTier: 'free' },
    isAuthenticated: true,
    refreshUserData: jest.fn(),
  }),
}));

jest.mock('../../../src/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../src/services/api', () => ({
  userApi: { updateProfile: jest.fn() },
  mediaApi: { uploadAvatar: jest.fn() },
}));
import { userApi } from '../../../src/services/api';
const updateProfile = userApi.updateProfile as jest.Mock;

import EditProfileScreen from '../edit-profile';

describe('J118 · profil düzenleme', () => {
  beforeEach(() => updateProfile.mockReset());

  it('J118.1 bio karakter sayacı yazıldıkça güncellenir', () => {
    renderWithProviders(<EditProfileScreen />);
    expect(screen.getByText('Hakkımda (0/500)')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByDisplayValue('Test'), 'Test'); // displayName var
    const bioInput = screen.getByPlaceholderText('mobile.bioPlaceholder');
    fireEvent.changeText(bioInput, 'merhaba');
    expect(screen.getByText('Hakkımda (7/500)')).toBeOnTheScreen();
  });

  it('J118.2 displayName 1 karaktere düşerse hata, updateProfile çağrılmaz', async () => {
    renderWithProviders(<EditProfileScreen />);
    fireEvent.changeText(screen.getByDisplayValue('Test'), 'A');
    fireEvent.press(screen.getByText('Değişiklikleri Kaydet'));
    await waitFor(() =>
      expect(screen.getByText('İsim en az 2 karakter olmalı')).toBeOnTheScreen(),
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
