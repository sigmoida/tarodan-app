import { translateMessage } from "../../i18n/translate";
import {
  CART_LOW_STOCK_THRESHOLD,
  cartStockWarning,
} from "./cart-stock-warning";

describe("cartStockWarning", () => {
  const render = (
    available: number | null,
    quantity: number,
    locale: "tr" | "en" = "tr",
  ) => {
    const warning = cartStockWarning(available, quantity);
    return warning && translateMessage(warning.key, locale, warning.values);
  };

  it("sınırsız stokta (null) uyarı vermez", () => {
    expect(cartStockWarning(null, 3)).toBeUndefined();
  });

  it("müsait 0 → Stokta yok / Out of stock", () => {
    expect(cartStockWarning(0, 1)).toEqual({ key: "server.cart.outOfStock" });
    expect(render(0, 1)).toBe("Stokta yok");
    expect(render(0, 1, "en")).toBe("Out of stock");
  });

  it("sepetteki adetten az → gerçek sayıyla 'Stokta sadece N adet var'", () => {
    expect(render(2, 3)).toBe("Stokta sadece 2 adet var");
    expect(render(2, 3, "en")).toBe("Only 2 in stock");
  });

  it("eşik ve altı → 'Son N ürün' (1 adette 'Son 1 ürün')", () => {
    expect(render(1, 1)).toBe("Son 1 ürün");
    expect(render(CART_LOW_STOCK_THRESHOLD, 1)).toBe(
      `Son ${CART_LOW_STOCK_THRESHOLD} ürün`,
    );
    expect(render(1, 1, "en")).toBe("Only 1 left");
  });

  it("eşiğin üstünde ve yeterli stokta uyarı yok", () => {
    expect(cartStockWarning(CART_LOW_STOCK_THRESHOLD + 1, 1)).toBeUndefined();
  });
});
