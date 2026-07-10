/**
 * J75 · Ödeme WebView ekranı — mobil UI dilimi.
 * Çağıran ekran PayTR URL'ini paymentUrl ile geçtiğinde WebView doğrudan o URL ile
 * render edilir (source.uri prop'u). initiate hatasında ErrorState gösterilir.
 * Backend initiate/verify/callback/idempotency backend-only.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

let mockParams: Record<string, string> = { id: 'pay-1', orderId: 'order-1', paymentUrl: 'https://www.paytr.com/odeme/guvenli/abc123' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
}));

jest.mock('@/services/api', () => ({
  paymentsApi: {
    initiate: jest.fn(),
    initiateGuest: jest.fn(),
    retry: jest.fn(),
    cancel: jest.fn(),
    verify: jest.fn(() => Promise.resolve({})),
    bypassComplete: jest.fn(),
  },
}));
import { paymentsApi } from '@/services/api';

// WebView'i source prop'unu testID ile yansıtan basit bir stub'a indir.
let lastWebViewSource: any = null;
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: (props: any) => {
      lastWebViewSource = props.source;
      return React.createElement(View, { testID: 'payment-webview' });
    },
    WebViewNavigation: {},
  };
});

jest.mock('@/services/sentry', () => ({ captureException: jest.fn() }));

import PaymentWebViewScreen from '../[id]';

describe('J75 · Ödeme WebView render', () => {
  beforeEach(() => {
    lastWebViewSource = null;
    mockParams = { id: 'pay-1', orderId: 'order-1', paymentUrl: 'https://www.paytr.com/odeme/guvenli/abc123' };
  });

  it('J75.1 paymentUrl geçildiğinde WebView o URL ile render edilir', async () => {
    renderWithProviders(<PaymentWebViewScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('payment-webview')).toBeOnTheScreen(),
    );
    expect(lastWebViewSource).toEqual({ uri: 'https://www.paytr.com/odeme/guvenli/abc123' });
    // initiate ÇAĞRILMAZ — çift token üretmemek için doğrudan URL yüklenir.
    expect(paymentsApi.initiate).not.toHaveBeenCalled();
  });

  it('J75.2 güvenli ödeme başlığı ve SSL bilgilendirmesi gösterilir', async () => {
    renderWithProviders(<PaymentWebViewScreen />);
    expect(await screen.findByText('Güvenli Ödeme')).toBeOnTheScreen();
    expect(screen.getByText(/SSL şifrelemeyle korunmaktadır/)).toBeOnTheScreen();
  });

  it('J75.3 initiate hata verirse ErrorState ve "Geri Dön" gösterilir', async () => {
    mockParams = { id: 'pay-1', orderId: 'order-1' }; // paymentUrl yok → initiate edilir
    (paymentsApi.initiate as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Ödeme başlatılamadı.' } },
    });
    renderWithProviders(<PaymentWebViewScreen />);
    expect(await screen.findByText('Ödeme başlatılamadı.')).toBeOnTheScreen();
    expect(screen.getByText('Geri Dön')).toBeOnTheScreen();
  });
});
