/**
 * J107 · Abonelik ayarları ekranı UI dilimleri.
 * J108 · İptal butonu görünürlüğü (premium aktif → "Aboneliği İptal Et",
 *        iptal edilmiş → downgrade uyarısı).
 * Yalnız MOBİL-UI: render durumları, buton/aksiyon görünürlüğü, misafir gate,
 * navigasyon wiring. Backend abonelik (tahsilat/webhook) backendOnly.
 *
 * Faz 1: subscriptionStore React Query'ye taşındı; bu test artık store yerine
 * API katmanını (membershipApi/paymentsApi) mock'lar ve gerçek controller +
 * türetme mantığını (isPremium/isCancelled/daysLeft) uçtan uca sürer.
 */
import React from "react";
import { screen, fireEvent } from "@testing-library/react-native";
import { renderWithProviders } from "@/test-utils";
import { resetRouterMocks, pushMock } from "@/test-utils/router-mock";

jest.mock("expo-router", () => {
  const rm = require("@/test-utils/router-mock").routerMock;
  return { ...rm, useFocusEffect: (cb: any) => cb() };
});

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// authStore — varsayılan: oturum açık. Test içinde override edilebilir.
let mockAuthState = { isAuthenticated: true };
jest.mock("@/stores/authStore", () => ({
  useAuthStore: () => mockAuthState,
}));

// API katmanı — controller'ın query/mutation'larını besler.
jest.mock("@/lib/api", () => ({
  membershipApi: {
    getCurrentMembership: jest.fn().mockResolvedValue({ data: null }),
    cancel: jest.fn().mockResolvedValue({ data: {} }),
    setAutoRenew: jest.fn().mockResolvedValue({ data: {} }),
  },
  paymentsApi: {
    getMyPayments: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

import { membershipApi } from "@/lib/api";
import SubscriptionSettingsScreen from "../subscription";

const mockGetMembership = membershipApi.getCurrentMembership as jest.Mock;

const activePremiumSub = {
  id: "s1",
  userId: "u1",
  tierId: "premium",
  tier: { type: "premium" },
  status: "active",
  billingPeriod: "monthly",
  currentPeriodStart: new Date(Date.now() - 86400000).toISOString(),
  currentPeriodEnd: new Date(Date.now() + 10 * 86400000).toISOString(),
  cancelledAt: null,
  createdAt: new Date().toISOString(),
};

describe("J107 · abonelik ayarları (settings/subscription)", () => {
  beforeEach(() => {
    resetRouterMocks();
    mockAuthState = { isAuthenticated: true };
    mockGetMembership.mockReset().mockResolvedValue({ data: null });
  });

  it("misafir (oturum kapalı) → giriş yap gate gösterir", () => {
    mockAuthState = { isAuthenticated: false };
    renderWithProviders(<SubscriptionSettingsScreen />);
    expect(screen.getByText("Giriş Yapın")).toBeOnTheScreen();
  });

  it('ücretsiz kullanıcı → "Premium\'a Yükselt" CTA gösterir', async () => {
    renderWithProviders(<SubscriptionSettingsScreen />);
    expect(await screen.findByText("Premium'a Yükselt")).toBeOnTheScreen();
  });

  it("regresyon: AKTİF ücretsiz üyelik premium gibi gösterilmemeli", async () => {
    // Backend her kullanıcıya status=active bir ücretsiz üyelik açar (~100 yıl
    // geçerli). Eskiden isPremium yalnız isSubscriptionActive'e bakıyordu; bu
    // yüzden ücretsiz kullanıcılar bile "Premium Üyelik" görüyordu. Artık tier
    // tipi de kontrol edildiği için ücretsiz üyelik premium sayılmamalı.
    mockGetMembership.mockResolvedValue({
      data: {
        ...activePremiumSub,
        tierId: "free",
        tier: { type: "free", name: "Ücretsiz Üyelik" },
        currentPeriodEnd: new Date(Date.now() + 365 * 86400000).toISOString(),
      },
    });
    renderWithProviders(<SubscriptionSettingsScreen />);
    expect(await screen.findByText("Ücretsiz Üyelik")).toBeOnTheScreen();
    expect(screen.getByText("Premium'a Yükselt")).toBeOnTheScreen();
    // Premium'a özel aksiyonlar görünmemeli
    expect(screen.queryByText("Aboneliği İptal Et")).toBeNull();
  });

  it('J108.1 premium aktif → "Aboneliği İptal Et" görünür', async () => {
    mockGetMembership.mockResolvedValue({ data: activePremiumSub });
    renderWithProviders(<SubscriptionSettingsScreen />);
    expect(await screen.findByText("Aboneliği İptal Et")).toBeOnTheScreen();
    expect(screen.getByText("Premium Üyelik")).toBeOnTheScreen();
  });

  it("J108.2 iptal edilmiş (dönem içi) abonelik → downgrade uyarısı gösterir, iptal butonu yok", async () => {
    mockGetMembership.mockResolvedValue({
      data: { ...activePremiumSub, status: "cancelled" },
    });
    renderWithProviders(<SubscriptionSettingsScreen />);
    expect(await screen.findByText(/gün sonra sona erecek/)).toBeOnTheScreen();
    expect(screen.queryByText("Aboneliği İptal Et")).toBeNull();
  });

  it("ücretsiz CTA → /upgrade ekranına yönlendirir", async () => {
    renderWithProviders(<SubscriptionSettingsScreen />);
    fireEvent.press(await screen.findByText("Premium'a Yükselt"));
    expect(pushMock).toHaveBeenCalledWith("/upgrade");
  });
});
