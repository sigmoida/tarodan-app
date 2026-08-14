/** @format */

import { beforeEach, describe, expect, it } from "vitest";
import { useCartStore } from "./cartStore";

/**
 * Seçim, "hariç tutulanlar" listesi olarak saklanır ve kalıcıdır. Kural: sepete
 * yeni giren ürün seçili gelir. Bu kuralı bozan tek şey, listede kalan ölü
 * kimliklerdi — testler onu sabitler.
 */
describe("cartStore selection", () => {
  beforeEach(() => {
    useCartStore.setState({ excludedProductIds: [] });
  });

  const prune = (ids: string[]) =>
    useCartStore.getState().pruneExcludedProductIds(ids);
  const excluded = () => useCartStore.getState().excludedProductIds;

  it("sepette olmayan kimlikleri düşürür", () => {
    useCartStore.setState({ excludedProductIds: ["a", "b"] });

    prune(["a"]);

    expect(excluded()).toEqual(["a"]);
  });

  it("çıkarılıp yeniden eklenen ürün seçili gelir", () => {
    // Kullanıcı 'a'nın seçimini kaldırdı; sepette 'a' ve 'b' var.
    useCartStore.getState().toggleProductSelected("a");
    prune(["a", "b"]);
    // Hâlâ sepette olduğu için seçimi korunur — bilerek kaldırmıştı.
    expect(excluded()).toEqual(["a"]);

    // 'a' sepetten çıkarıldı: kimlik artık ölü, ilk okumada düşer.
    prune(["b"]);
    expect(excluded()).toEqual([]);

    // 'a' yeniden eklendiğinde dışlanmış değil → seçili gelir.
    prune(["a", "b"]);
    expect(excluded()).toEqual([]);
  });

  it("değişiklik yoksa diziyi yeniden yazmaz", () => {
    useCartStore.setState({ excludedProductIds: ["a"] });
    const before = excluded();

    prune(["a", "b"]);

    // Aynı referans: gereksiz set, store'a abone her bileşeni render ederdi.
    expect(excluded()).toBe(before);
  });

  it("boş sepette budama yapılmaz — çağıran erken döner", () => {
    useCartStore.setState({ excludedProductIds: ["a"] });

    // Store'un kendisi boş listeyle çağrılırsa her şeyi düşürür; sepet
    // sorgusu çözülmeden bunun ÇAĞRILMAMASI `useCartSelection`'ın işidir.
    prune([]);

    expect(excluded()).toEqual([]);
  });
});
