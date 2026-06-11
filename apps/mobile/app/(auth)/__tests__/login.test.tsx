/**
 * J44 · Yanlış şifre → hata banner. + misafir/geri butonu navigasyon wiring.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';
import { resetRouterMocks, replaceMock, backMock, canGoBackMock } from '../../../src/test-utils/router-mock';

jest.mock('expo-router', () => require('../../../src/test-utils/router-mock').routerMock);

jest.mock('../../../src/services/api', () => ({
  authApi: { login: jest.fn(), getProfile: jest.fn(), resendVerification: jest.fn() },
}));
import { authApi } from '../../../src/services/api';

jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => ({ login: jest.fn() }),
}));

import LoginScreen from '../login';

const mockLogin = authApi.login as jest.Mock;

describe('J44 · login (auth)', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    resetRouterMocks();
  });

  it('J44.2 yanlış şifre → hata banner görünür', async () => {
    mockLogin.mockRejectedValue({ response: { data: { message: 'Geçersiz kimlik bilgileri' } } });
    renderWithProviders(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('login-email-input'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'wrong');
    fireEvent.press(screen.getByTestId('login-submit-button'));

    await waitFor(() =>
      expect(screen.getByTestId('login-error-banner')).toBeOnTheScreen(),
    );
  });

  it('geri butonu: geçmiş yoksa ana sayfaya replace eder', () => {
    canGoBackMock.mockReturnValue(false);
    renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByTestId('login-back-button'));
    expect(replaceMock).toHaveBeenCalledWith('/');
  });

  it('misafir butonu: geçmiş varsa geri gider', () => {
    canGoBackMock.mockReturnValue(true);
    renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByTestId('continue-as-guest-button'));
    expect(backMock).toHaveBeenCalled();
  });
});
