/**
 * J126 · Statik bilgi sayfaları (about / faq / guides) — mobil UI dilimi.
 * Başlık + içerik görünür, FAQ/Guides accordion içeriği genişletilince görünür.
 * Bu ekranlar tamamen statik (API yok); slug-bazlı "bulunamadı" durumu page/[slug] testinde.
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../src/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock('../../src/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import AboutScreen from '../about';
import FAQScreen from '../faq';
import GuidesScreen from '../guides';

describe('J126 · Hakkımızda (about) render', () => {
  it('J126.4 başlık ve içerik bölümleri görünür', () => {
    renderWithProviders(<AboutScreen />);
    expect(screen.getByText('Tarodan')).toBeOnTheScreen();
    expect(screen.getByText('Hikayemiz')).toBeOnTheScreen();
    expect(screen.getByText('Misyon')).toBeOnTheScreen();
    expect(screen.getByText('Değerlerimiz')).toBeOnTheScreen();
  });
});

describe('J126 · SSS (faq) render', () => {
  it('J126.5 kategoriler ve sorular render edilir', () => {
    renderWithProviders(<FAQScreen />);
    expect(screen.getByText('Satın Alma')).toBeOnTheScreen();
    expect(screen.getByText('Nasıl sipariş veririm?')).toBeOnTheScreen();
  });

  it('J126.6 soruya dokununca cevap genişler', () => {
    renderWithProviders(<FAQScreen />);
    // Başlangıçta hiçbiri açık değil → cevap görünmez
    const answer = 'Beğendiğiniz ürünü seçin, "Satın Al" butonuna tıklayın, teslimat adresinizi girin ve ödeme bilgilerinizi ekleyerek siparişinizi tamamlayın. Sipariş onayı e-posta ile gönderilecektir.';
    expect(screen.queryByText(answer)).toBeNull();
    fireEvent.press(screen.getByText('Nasıl sipariş veririm?'));
    expect(screen.getByText(answer)).toBeOnTheScreen();
  });
});

describe('J126 · Rehberler (guides) render', () => {
  it('J126.7 rehber başlıkları görünür; ilk rehber varsayılan açık', () => {
    renderWithProviders(<GuidesScreen />);
    expect(screen.getByText('Nasıl Satın Alınır?')).toBeOnTheScreen();
    expect(screen.getByText('Nasıl Satılır?')).toBeOnTheScreen();
    // expandedIndex=0 başlangıç → ilk rehberin adımı görünür
    expect(
      screen.getByText('Arama veya kategoriler aracılığıyla istediğiniz ürünü bulun.'),
    ).toBeOnTheScreen();
  });
});
