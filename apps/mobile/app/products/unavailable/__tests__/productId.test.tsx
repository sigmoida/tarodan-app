/**
 * J52 · Stok-yok ekranı — mobil UI dilimi.
 * Hero (ikon/başlık/gövde), tekrar-stokta varyantı + "Ürünü Gör" butonu,
 * "Tüm kategori" CTA + router.push wiring, benzer ürünler listesi / boş durum.
 * Backend stok/satın alma mantığı backend-only.
 */
import React from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "@/test-utils";

let mockParams: Record<string, string> = { productId: "prod-1" };
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
import { router } from "expo-router";
const pushMock = router.push as jest.Mock;

// i18n: gerçek TR mesajlarını {param} interpolasyonu ile çözen hafif t().
jest.mock("react-i18next", () => {
  const tr = require("@tarodan/i18n").messages.tr; // #216: katalog tek kaynak
  const get = (path: string) =>
    path.split(".").reduce((o: any, k) => (o == null ? undefined : o[k]), tr);
  return {
    useTranslation: () => ({
      t: (key: string, params?: Record<string, string | number>) => {
        let val = get(key);
        if (typeof val !== "string") return key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            val = val.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
          }
        }
        return val;
      },
    }),
  };
});

jest.mock("@/lib/api", () => ({
  productsApi: { getOne: jest.fn(), getSimilar: jest.fn() },
}));
import { productsApi } from "@/lib/api";

import ProductUnavailableScreen from "../[productId]";

const getOne = productsApi.getOne as jest.Mock;
const getSimilar = productsApi.getSimilar as jest.Mock;

describe("J52 · Stok-yok ekranı", () => {
  beforeEach(() => {
    getOne.mockReset();
    getSimilar.mockReset();
    pushMock.mockReset();
    mockParams = { productId: "prod-1" };
  });

  it("J52.1 stok-yok hero başlık ve gövde gösterilir", async () => {
    getOne.mockResolvedValue({
      data: {
        data: {
          id: "prod-1",
          title: "Deri Ceket",
          status: "sold",
          quantity: 0,
        },
      },
    });
    getSimilar.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<ProductUnavailableScreen />);

    expect(
      await screen.findByTestId("unavailable-hero-title"),
    ).toHaveTextContent("Bu ürün artık stokta yok");
    expect(screen.getByText(/"Deri Ceket" başka bir alıcı/)).toBeOnTheScreen();
  });

  it("J52.2 kategori CTA basınca kategori sayfasına yönlendirir", async () => {
    getOne.mockResolvedValue({
      data: {
        data: {
          id: "prod-1",
          title: "Deri Ceket",
          status: "sold",
          quantity: 0,
          category: { id: "c1", name: "Giyim", slug: "giyim" },
        },
      },
    });
    getSimilar.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<ProductUnavailableScreen />);

    const cta = await screen.findByText("Tüm Giyim ürünleri");
    fireEvent.press(cta);
    expect(pushMock).toHaveBeenCalledWith("/category/giyim");
  });

  it('J52.3 tekrar stokta → kutlama başlığı + "Ürünü Gör" butonu push eder', async () => {
    getOne.mockResolvedValue({
      data: {
        data: {
          id: "prod-1",
          title: "Deri Ceket",
          status: "active",
          quantity: 3,
        },
      },
    });
    getSimilar.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<ProductUnavailableScreen />);

    expect(
      await screen.findByTestId("unavailable-hero-title"),
    ).toHaveTextContent("İyi haber: ürün tekrar satışta!");
    fireEvent.press(screen.getByText("Ürünü Gör"));
    expect(pushMock).toHaveBeenCalledWith("/product/prod-1");
  });

  it("J52.4 benzer ürün yoksa boş metin gösterilir", async () => {
    getOne.mockResolvedValue({
      data: {
        data: {
          id: "prod-1",
          title: "Deri Ceket",
          status: "sold",
          quantity: 0,
        },
      },
    });
    getSimilar.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<ProductUnavailableScreen />);

    expect(
      await screen.findByText("Bu kategoride başka aktif ürün bulunamadı."),
    ).toBeOnTheScreen();
  });

  it("J52.5 benzer ürünler listelenir", async () => {
    getOne.mockResolvedValue({
      data: {
        data: {
          id: "prod-1",
          title: "Deri Ceket",
          status: "sold",
          quantity: 0,
        },
      },
    });
    getSimilar.mockResolvedValue({
      data: {
        data: [{ id: "s1", title: "Benzer Ceket", price: 200, images: [] }],
      },
    });
    renderWithProviders(<ProductUnavailableScreen />);

    expect(await screen.findByText("Benzer Ceket")).toBeOnTheScreen();
  });
});
