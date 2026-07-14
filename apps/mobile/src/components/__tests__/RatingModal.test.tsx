/**
 * J31/J109/J110 · Puanlama UI (RatingModal) — mobil UI dilimi.
 * 1-5 yıldız seçimi, 0 puan engeli (Gönder disabled), puan metni gösterimi,
 * karakter sayacı, satıcı kriterleri ve ürün/satıcı başlık ayrımı.
 * Backend kaydı (POST /ratings/*, alışveriş şartı, onay akışı) backend-only.
 */
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import RatingModal from '../RatingModal';
import { renderWithProviders } from '../../test-utils';

jest.mock('@/lib/api', () => ({
  api: { post: jest.fn(() => Promise.resolve({ data: {} })) },
}));
import { api } from '@/lib/api';

let mockLimits: { maxReviewChars: number } | undefined = { maxReviewChars: 500 };
jest.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ limits: mockLimits }),
}));

const postMock = api.post as jest.Mock;

function renderModal(
  props: Partial<React.ComponentProps<typeof RatingModal>> = {},
) {
  const onDismiss = jest.fn();
  const onSuccess = jest.fn();
  const utils = renderWithProviders(
    <RatingModal
      visible
      onDismiss={onDismiss}
      onSuccess={onSuccess}
      type="product"
      orderId="order-1"
      productId="prod-1"
      productTitle="Vintage Kamera"
      {...props}
    />,
  );
  // İlk 5 TouchableOpacity yıldız butonları (1..5).
  const getStars = () => utils.UNSAFE_getAllByType(TouchableOpacity).slice(0, 5);
  return { onDismiss, onSuccess, getStars };
}

describe('J31 · Ürünü puanla (1-5 yıldız UI)', () => {
  beforeEach(() => {
    postMock.mockClear();
    mockLimits = { maxReviewChars: 500 };
  });

  it('ürün değerlendirme başlığını ve hedef ürün adını gösterir', () => {
    renderModal();
    expect(screen.getByText('Ürünü Değerlendir')).toBeOnTheScreen();
    expect(screen.getByText('Vintage Kamera')).toBeOnTheScreen();
    expect(screen.getByText('Puan')).toBeOnTheScreen();
  });

  it('başlangıçta puan seçilmemişken "Puan seçin" metni gösterir', () => {
    renderModal();
    expect(screen.getByText('Puan seçin')).toBeOnTheScreen();
  });

  it('yıldıza basınca seçilen puana karşılık gelen metin gösterilir', () => {
    const { getStars } = renderModal();
    const stars = getStars();
    fireEvent.press(stars[3]); // 4. yıldız
    expect(screen.getByText('İyi')).toBeOnTheScreen();
    fireEvent.press(stars[4]); // 5. yıldız
    expect(screen.getByText('Mükemmel')).toBeOnTheScreen();
    fireEvent.press(stars[0]); // 1. yıldız
    expect(screen.getByText('Çok Kötü')).toBeOnTheScreen();
  });
});

describe('J109 · 0 puan engeli (UI) — Gönder disabled', () => {
  beforeEach(() => {
    postMock.mockClear();
    mockLimits = { maxReviewChars: 500 };
  });

  it('puan 0 iken Gönder basılınca API çağrılmaz (gönderim engellenir)', () => {
    renderModal();
    fireEvent.press(screen.getByRole('button', { name: 'Gönder' }));
    expect(postMock).not.toHaveBeenCalled();
  });

  it('geçerli puan seçildikten sonra Gönder ürün rating endpointine post eder', async () => {
    const { getStars } = renderModal();
    fireEvent.press(getStars()[4]); // 5 puan
    fireEvent.press(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(
        '/ratings/products',
        expect.objectContaining({ productId: 'prod-1', orderId: 'order-1', score: 5 }),
      ),
    );
  });
});

describe('J110 · Satıcıyı puanla + karakter limiti (UI)', () => {
  beforeEach(() => {
    postMock.mockClear();
    mockLimits = { maxReviewChars: 500 };
  });

  it('satıcı tipinde başlık ve değerlendirme kriterleri gösterilir', () => {
    renderModal({ type: 'seller', sellerId: 's1', sellerName: 'Ahmet Satıcı' });
    expect(screen.getByText('Satıcıyı Değerlendir')).toBeOnTheScreen();
    expect(screen.getByText('Ahmet Satıcı')).toBeOnTheScreen();
    expect(screen.getByText('Değerlendirme Kriterleri:')).toBeOnTheScreen();
    expect(screen.getByText('Ürün Doğruluğu (%40)')).toBeOnTheScreen();
  });

  it('satıcı puanı Gönder ile kullanıcı rating endpointine post eder', async () => {
    const { getStars } = renderModal({ type: 'seller', sellerId: 's1', sellerName: 'Ahmet Satıcı' });
    fireEvent.press(getStars()[3]); // 4 puan
    fireEvent.press(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(
        '/ratings/users',
        expect.objectContaining({ receiverId: 's1', orderId: 'order-1', score: 4 }),
      ),
    );
  });

  it('ücretsiz üye için 500 karakter limiti ve premium notu gösterilir', () => {
    renderModal();
    expect(screen.getByText('0/500')).toBeOnTheScreen();
    expect(
      screen.getByText('Premium üyeler 2000 karakter yazabilir'),
    ).toBeOnTheScreen();
  });
});
