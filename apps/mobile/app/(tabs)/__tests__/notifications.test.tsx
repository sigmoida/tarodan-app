/**
 * J38 · Bildirim listesi/okunmamış sayaç/boş durum.
 * J113 · "Tümünü Okundu" butonu + bildirime tıklayınca navigasyon wiring.
 *
 * Sadece MOBİL-UI: liste render, okunmamış rozet/sayaç, boş durum metni,
 * giriş yapılmadı durumu, mark-all butonu görünürlüğü/çağrısı, item press
 * router.push wiring. Backend işaretleme mantığı (kalıcılık, push, soketler)
 * backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { resetRouterMocks, pushMock, routerMock } from '@/test-utils/router-mock';

// useFocusEffect mount'ta callback'i bir kez çalıştırsın (gerçek davranış).
jest.mock('expo-router', () => ({
  ...require('@/test-utils/router-mock').routerMock,
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, []);
  },
}));

jest.mock('@/services/api', () => ({
  notificationsApi: {
    getAll: jest.fn(),
    getUnreadCount: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  },
}));
import { notificationsApi } from '@/services/api';

let mockAuthed = true;
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: mockAuthed }),
}));

import NotificationsScreen from '../notifications';

const getAll = notificationsApi.getAll as jest.Mock;
const getUnreadCount = notificationsApi.getUnreadCount as jest.Mock;
const markAsRead = notificationsApi.markAsRead as jest.Mock;
const markAllAsRead = notificationsApi.markAllAsRead as jest.Mock;

const sample = [
  {
    id: 'n1',
    type: 'order_created',
    title: 'Yeni Sipariş',
    message: 'Siparişin oluşturuldu',
    isRead: false,
    createdAt: new Date().toISOString(),
    data: { orderId: 'o1' },
  },
  {
    id: 'n2',
    type: 'new_message',
    title: 'Yeni Mesaj',
    message: 'Bir mesajın var',
    isRead: true,
    createdAt: new Date().toISOString(),
  },
];

beforeEach(() => {
  mockAuthed = true;
  resetRouterMocks();
  getAll.mockReset();
  getUnreadCount.mockReset();
  markAsRead.mockReset().mockResolvedValue({});
  markAllAsRead.mockReset().mockResolvedValue({});
  getUnreadCount.mockResolvedValue({ data: { count: 0 } });
});

describe('J38 · bildirim listesi ve okunmamış sayaç', () => {
  it('J38.1 liste render: başlık ve mesajlar görünür', async () => {
    getAll.mockResolvedValue({ data: { notifications: sample } });
    getUnreadCount.mockResolvedValue({ data: { count: 1 } });
    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText('Yeni Sipariş')).toBeOnTheScreen();
    expect(screen.getByText('Yeni Mesaj')).toBeOnTheScreen();
  });

  it('J38.2 okunmamış sayaç rozeti backend count ile gösterilir', async () => {
    getAll.mockResolvedValue({ data: { notifications: sample } });
    getUnreadCount.mockResolvedValue({ data: { count: 3 } });
    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText('3')).toBeOnTheScreen();
  });

  it('J38.3 boş durum: bildirim yoksa boş metin görünür', async () => {
    getAll.mockResolvedValue({ data: { notifications: [] } });
    getUnreadCount.mockResolvedValue({ data: { count: 0 } });
    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText('Henüz bildirimin yok')).toBeOnTheScreen();
  });

  it('J38.4 giriş yapılmadıysa giriş yap boş durumu gösterilir', async () => {
    mockAuthed = false;
    renderWithProviders(<NotificationsScreen />);
    expect(
      await screen.findByText('Bildirimleri görmek için giriş yapın'),
    ).toBeOnTheScreen();
    expect(getAll).not.toHaveBeenCalled();
  });
});

describe('J113 · tümünü okundu butonu ve navigasyon wiring', () => {
  it('J113.1 okunmamış varken "Tümünü Okundu" butonu görünür ve çağrılır', async () => {
    getAll.mockResolvedValue({ data: { notifications: sample } });
    getUnreadCount.mockResolvedValue({ data: { count: 1 } });
    renderWithProviders(<NotificationsScreen />);

    const btn = await screen.findByText('Tümünü Okundu');
    fireEvent.press(btn);
    await waitFor(() => expect(markAllAsRead).toHaveBeenCalledTimes(1));
  });

  it('J113.2 okunmamış yoksa "Tümünü Okundu" butonu görünmez', async () => {
    getAll.mockResolvedValue({
      data: { notifications: [{ ...sample[1] }] },
    });
    getUnreadCount.mockResolvedValue({ data: { count: 0 } });
    renderWithProviders(<NotificationsScreen />);

    await screen.findByText('Yeni Mesaj');
    expect(screen.queryByText('Tümünü Okundu')).toBeNull();
  });

  it('J113.3 bildirime tıklayınca ilgili rotaya push edilir', async () => {
    getAll.mockResolvedValue({ data: { notifications: sample } });
    getUnreadCount.mockResolvedValue({ data: { count: 1 } });
    renderWithProviders(<NotificationsScreen />);

    fireEvent.press(await screen.findByText('Yeni Sipariş'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/orders/o1'));
  });

  it('J113.4 okunmamış bildirime tıklayınca markAsRead çağrılır', async () => {
    getAll.mockResolvedValue({ data: { notifications: sample } });
    getUnreadCount.mockResolvedValue({ data: { count: 1 } });
    renderWithProviders(<NotificationsScreen />);

    fireEvent.press(await screen.findByText('Yeni Sipariş'));
    await waitFor(() => expect(markAsRead).toHaveBeenCalledWith('n1'));
  });
});
