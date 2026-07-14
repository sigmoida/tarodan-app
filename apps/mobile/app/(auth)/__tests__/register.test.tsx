/**
 * J43 · Aynı email ile kayıt → backend "Bu email adresi zaten kayıtlı" mesajı UI'da gösterilir.
 * (Form mantığının mobil-UI yüzü; backend kuralı API e2e'de.)
 * birthDate jest.setup'taki EXPO_PUBLIC_MAESTRO=1 ile '1990-01-01' öndolu.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { routerMock, resetRouterMocks } from '@/test-utils/router-mock';

jest.mock('expo-router', () => require('@/test-utils/router-mock').routerMock);

jest.mock('@/lib/api', () => ({
  authApi: { register: jest.fn() },
}));
import { authApi } from '@/lib/api';
import RegisterScreen from '../register';

const mockRegister = authApi.register as jest.Mock;

function fillValidFormExceptResult() {
  fireEvent.changeText(screen.getByTestId('register-displayName-input'), 'Test Kullanıcı');
  fireEvent.changeText(screen.getByTestId('register-email-input'), 'dupe@demo.com');
  fireEvent.changeText(screen.getByTestId('register-password-input'), 'Demo1234');
  fireEvent.changeText(screen.getByTestId('register-confirmPassword-input'), 'Demo1234');
  fireEvent.press(screen.getByTestId('register-acceptTerms'));
  fireEvent(screen.getByTestId('register-birthDate-input'), 'onChange', '1990-01-01');
}

describe('J43 · aynı email ile kayıt reddi (register)', () => {
  beforeEach(() => {
    mockRegister.mockReset();
    resetRouterMocks();
  });

  it('J43.2 backend "zaten kayıtlı" mesajını gösterir', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { message: 'Bu email adresi zaten kayıtlı' } },
    });
    renderWithProviders(<RegisterScreen />);
    fillValidFormExceptResult();
    fireEvent.press(screen.getByTestId('register-submit-button'));

    await waitFor(() =>
      expect(screen.getByText('Bu email adresi zaten kayıtlı')).toBeOnTheScreen(),
    );
  });

  it('başarılı kayıt login ekranına yönlendirir', async () => {
    mockRegister.mockResolvedValue({ data: { id: 'u1' } });
    renderWithProviders(<RegisterScreen />);
    fillValidFormExceptResult();
    fireEvent.press(screen.getByTestId('register-submit-button'));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    expect(routerMock.router.replace).toHaveBeenCalledWith('/(auth)/login');
  });
});
