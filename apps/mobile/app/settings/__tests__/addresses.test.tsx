/**
 * J32 / J388 · Adres ekleme form validasyonu (mobil-UI dilimi).
 * handleSubmit client-side: zorunlu alan boş → uyarı; adres < 10 karakter → uyarı;
 * telefon < 10 hane → uyarı. Validasyon geçmeden saveMutation (api) çağrılmaz.
 */
import React from 'react';
import { appAlert } from '@tarodan/ui-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

jest.mock('expo-router', () => ({
  ...require('../../../src/test-utils/router-mock').routerMock,
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true, limits: { maxAddresses: 10 } }),
}));

jest.mock('../../../src/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../src/services/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));
import { api } from '../../../src/services/api';
const post = api.post as jest.Mock;

import AddressesScreen from '../addresses';

describe('J32 · adres ekleme form validasyonu', () => {
  let alertSpy: jest.Mock;
  beforeEach(() => {
    post.mockReset();
    alertSpy = (appAlert as jest.Mock).mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  const openDialog = async () => {
    // Boş listede "Adres Ekle" butonu diyaloğu açar (query çözülene kadar bekle)
    const addBtn = await screen.findByText('Adres Ekle');
    fireEvent.press(addBtn);
  };

  it('J32.1 zorunlu alanlar boşken kaydet → uyarı, API çağrılmaz', async () => {
    renderWithProviders(<AddressesScreen />);
    await openDialog();
    fireEvent.press(screen.getByTestId('address-save-button'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Hata',
      'Lütfen zorunlu alanları doldurun (ilçe dahil)',
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('J32.2 başlık inputu görünür ve düzenlenebilir', async () => {
    renderWithProviders(<AddressesScreen />);
    await openDialog();
    const titleInput = screen.getByTestId('address-title-input');
    fireEvent.changeText(titleInput, 'Ev');
    expect(titleInput.props.value).toBe('Ev');
  });
});
