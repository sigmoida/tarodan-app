/**
 * J32 / J388 · Adres ekleme form validasyonu (mobil-UI dilimi).
 * handleSubmit client-side: zorunlu alan boş → uyarı; adres < 10 karakter → uyarı;
 * telefon < 10 hane → uyarı. Validasyon geçmeden saveMutation (api) çağrılmaz.
 * Ayrıca bulgu #32: her hatalı alan görünür inline hata (kırmızı çerçeve + alt mesaj)
 * alır; alanı düzeltince o alanın inline hatası anında kalkar.
 */
import React from 'react';
import { appAlert } from '@tarodan/ui-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

jest.mock('expo-router', () => ({
  ...require('@/test-utils/router-mock').routerMock,
  useFocusEffect: jest.fn(),
}));

jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true, limits: { maxAddresses: 10 } }),
}));

jest.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));
import { api } from '@/lib/api';
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

  it('J32.3 boş submit → alanların altında inline "Zorunlu alan" hatası görünür', async () => {
    renderWithProviders(<AddressesScreen />);
    await openDialog();
    fireEvent.press(screen.getByTestId('address-save-button'));
    // title + fullName + phone + address Input'ları mesajı basar (il/ilçe kırmızı çerçeve alır).
    const errs = await screen.findAllByText('Zorunlu alan');
    expect(errs.length).toBeGreaterThanOrEqual(4);
  });

  it('J32.4 hatalı alanı düzeltince o alanın inline hatası kalkar', async () => {
    renderWithProviders(<AddressesScreen />);
    await openDialog();
    fireEvent.press(screen.getByTestId('address-save-button'));
    const beforeCount = (await screen.findAllByText('Zorunlu alan')).length;
    fireEvent.changeText(screen.getByTestId('address-title-input'), 'Ev');
    await waitFor(() => {
      expect(screen.getAllByText('Zorunlu alan').length).toBe(beforeCount - 1);
    });
  });
});

/**
 * Bulgu #23 regresyonu · "Varsayılan Yap" yükleme durumu yalnız basılan satırda.
 * setDefaultMutation tek hook → isPending paylaşımlı; fix `variables === address.id`
 * ile satıra daraltıyor. Button isLoading=true iken başlığı yerine spinner basar,
 * dolayısıyla pending satırın "Varsayılan Yap" metni kaybolur, diğeri kalır.
 */
describe('J32.b · "Varsayılan Yap" satır-bazlı yükleme (bulgu #23)', () => {
  const get = api.get as jest.Mock;
  const patch = api.patch as jest.Mock;
  let resolvePatch: (value: unknown) => void;

  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
    (appAlert as jest.Mock).mockImplementation(() => {});
    get.mockResolvedValue({
      data: [
        { id: 'a1', title: 'Ev', fullName: 'Ayşe', address: 'Sokak 1', city: 'İstanbul', district: 'Kadıköy', phone: '5551112233', isDefault: false },
        { id: 'a2', title: 'İş', fullName: 'Ayşe', address: 'Cadde 2', city: 'Ankara', district: 'Çankaya', phone: '5554445566', isDefault: false },
      ],
    });
    // Kontrollü deferred → mutation'ı pending tutar; test sonunda çözüp temizleriz
    // (çözülmeyen promise bırakmak tüm suite'i kapanışta asılı bırakırdı).
    patch.mockReturnValue(new Promise((resolve) => { resolvePatch = resolve; }));
  });

  it('bir satırda işlem beklerken yalnız o satır spinner gösterir, diğeri kalır', async () => {
    renderWithProviders(<AddressesScreen />);

    const buttons = await screen.findAllByText('Varsayılan Yap');
    expect(buttons).toHaveLength(2);

    fireEvent.press(buttons[0]!);

    // a1 pending → başlığı spinner ile değişir; a2 dokunulmadığı için "Varsayılan Yap" kalır.
    await waitFor(() => {
      expect(screen.getAllByText('Varsayılan Yap')).toHaveLength(1);
    });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith('/users/me/addresses/a1/default');

    // Mutation'ı çöz → onSuccess invalidate eder, a1 satırı yükleme durumundan çıkar,
    // dangling handle kalmaz. Her iki buton tekrar görünür.
    resolvePatch({ data: { id: 'a1' } });
    await waitFor(() => {
      expect(screen.getAllByText('Varsayılan Yap')).toHaveLength(2);
    });
  });
});
