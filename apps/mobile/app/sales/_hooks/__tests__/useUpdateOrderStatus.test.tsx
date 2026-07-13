/**
 * J63 · Satıcı sipariş durumu mutasyonu — birim testi (#57).
 *
 * Fiziksel siparişlerde shipment ödeme anında OTOMATİK oluşur. "Kargoya verildi"
 * akışı bu yüzden POST /shipping ile YENİ shipment oluşturamaz (400 "zaten var").
 * Doğru davranış: mevcut shipment'i GET /shipping/order/:id ile çek, takip numarasını
 * PATCH /shipping/:id/tracking ile işle; shipment yoksa (eski/edge sipariş) bir kez
 * oluştur. Bu davranışın red→green regresyon güvencesi burada.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react-native";

jest.mock("@tarodan/ui-native", () => ({ appAlert: jest.fn() }));

jest.mock("@/services/api", () => ({
  ordersApi: { markAsPreparing: jest.fn() },
  shippingApi: {
    getOrderShipments: jest.fn(),
    createShipment: jest.fn(),
    updateTracking: jest.fn(),
  },
}));

import { ordersApi, shippingApi } from "@/services/api";
import { useUpdateOrderStatus } from "../useUpdateOrderStatus";

const orders = ordersApi as unknown as { markAsPreparing: jest.Mock };
const shipping = shippingApi as unknown as {
  getOrderShipments: jest.Mock;
  createShipment: jest.Mock;
  updateTracking: jest.Mock;
};

// children: any → test ortamındaki çift @types/react ReactNode uyuşmazlığından kaçın.
function wrapper({ children }: { children: any }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  orders.markAsPreparing.mockReset().mockResolvedValue({ data: {} });
  shipping.getOrderShipments.mockReset();
  shipping.createShipment.mockReset();
  shipping.updateTracking.mockReset().mockResolvedValue({ data: {} });
});

describe("J63 · useUpdateOrderStatus", () => {
  it("shipped: mevcut auto-created shipment çekilir, tracking PATCH edilir; POST /shipping çağrılmaz", async () => {
    shipping.getOrderShipments.mockResolvedValue({
      data: { data: { id: "shp-1" } },
    });
    const { result } = renderHook(() => useUpdateOrderStatus(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        orderId: "ord-1",
        status: "shipped",
        trackingNumber: "TRK123",
      });
    });

    expect(shipping.getOrderShipments).toHaveBeenCalledWith("ord-1");
    expect(shipping.updateTracking).toHaveBeenCalledWith("shp-1", {
      trackingNumber: "TRK123",
    });
    expect(shipping.createShipment).not.toHaveBeenCalled();
  });

  it("shipped fallback: shipment yoksa (404) bir kez oluşturulur, sonra tracking PATCH edilir", async () => {
    shipping.getOrderShipments.mockRejectedValue({ response: { status: 404 } });
    shipping.createShipment.mockResolvedValue({
      data: { data: { id: "shp-new" } },
    });
    const { result } = renderHook(() => useUpdateOrderStatus(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        orderId: "ord-2",
        status: "shipped",
        trackingNumber: "TRK999",
      });
    });

    expect(shipping.createShipment).toHaveBeenCalledWith({
      orderId: "ord-2",
      provider: "surat",
    });
    expect(shipping.updateTracking).toHaveBeenCalledWith("shp-new", {
      trackingNumber: "TRK999",
    });
  });

  it("shipped: takip numarası yoksa tracking PATCH edilmez", async () => {
    shipping.getOrderShipments.mockResolvedValue({
      data: { data: { id: "shp-1" } },
    });
    const { result } = renderHook(() => useUpdateOrderStatus(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ orderId: "ord-3", status: "shipped" });
    });

    expect(shipping.updateTracking).not.toHaveBeenCalled();
  });

  it("processing: POST /orders/:id/prepare (markAsPreparing) çağrılır", async () => {
    const { result } = renderHook(() => useUpdateOrderStatus(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        orderId: "ord-4",
        status: "processing",
      });
    });

    expect(orders.markAsPreparing).toHaveBeenCalledWith("ord-4");
    expect(shipping.getOrderShipments).not.toHaveBeenCalled();
  });

  it("onDone başarıda çağrılır (modal kapatma için)", async () => {
    shipping.getOrderShipments.mockResolvedValue({
      data: { data: { id: "shp-1" } },
    });
    const onDone = jest.fn();
    const { result } = renderHook(() => useUpdateOrderStatus(onDone), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        orderId: "ord-5",
        status: "shipped",
        trackingNumber: "T",
      });
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
