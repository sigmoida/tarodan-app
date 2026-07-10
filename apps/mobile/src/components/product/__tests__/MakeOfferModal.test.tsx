/**
 * Örnek komponent testi (RNTL) — Maestro'da dövüştüğümüz teklif validasyonunun
 * saniyenin altında, simülatör/backend olmadan, modal içeriği sorgulanabilir hâlde testi.
 * Strateji: docs/superpowers/specs/mobile-test-strategy.md
 */
import React from 'react';
import { appAlert } from '@tarodan/ui-native';
import {  } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import MakeOfferModal from '../MakeOfferModal';
import { renderWithProviders } from '../../../test-utils';

// API'yi mock'la — ağ yok, deterministik.
jest.mock('../../../services/api', () => ({
  offersApi: { create: jest.fn(() => Promise.resolve({ data: { id: 'offer-1' } })) },
}));
import { offersApi } from '../../../services/api';

const createMock = offersApi.create as jest.Mock;

function renderModal(props: Partial<React.ComponentProps<typeof MakeOfferModal>> = {}) {
  const onDismiss = jest.fn();
  const onSuccess = jest.fn();
  renderWithProviders(
    <MakeOfferModal
      visible
      onDismiss={onDismiss}
      onSuccess={onSuccess}
      productId="prod-1"
      productTitle="Test Ürünü"
      listPrice={390}
      {...props}
    />,
  );
  return { onDismiss, onSuccess };
}

describe('MakeOfferModal', () => {
  beforeEach(() => {
    createMock.mockClear();
    (appAlert as jest.Mock).mockImplementation(() => {});
  });

  it('boş tutarda Teklif Gönder devre dışı', () => {
    renderModal();
    expect(screen.getByTestId('offer-submit-button')).toBeDisabled();
  });

  it('geçerli tutar girilince buton aktifleşir ve teklif gönderilir', async () => {
    const { onSuccess } = renderModal();
    fireEvent.changeText(screen.getByTestId('offer-amount-input'), '200');
    expect(screen.getByTestId('offer-submit-button')).toBeEnabled();

    fireEvent.press(screen.getByTestId('offer-submit-button'));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith({
      productId: 'prod-1',
      amount: 200,
      message: undefined,
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('liste fiyatının %50 altında teklif reddedilir (API çağrılmaz)', async () => {
    renderModal({ listPrice: 390 });
    fireEvent.changeText(screen.getByTestId('offer-amount-input'), '100'); // < 195
    fireEvent.press(screen.getByTestId('offer-submit-button'));

    // Hata artık modal-içi ModalMessage ile gösteriliyor (appAlert modal açıkken
    // iOS'u dondurduğu için; useModalMessage primitive'i). testID="modal-message".
    await waitFor(() =>
      expect(screen.getByText(/Minimum teklif/)).toBeOnTheScreen(),
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});
