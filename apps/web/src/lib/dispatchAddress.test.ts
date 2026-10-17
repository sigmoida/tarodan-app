/** @format */

import { describe, expect, it } from "vitest";
import { evaluateDispatchAddress } from "./dispatchAddress";

const ok = {
  id: "1",
  phone: "+905321234567",
  city: "İstanbul",
  district: "Kadıköy",
  address: "Bir sokak 1",
};

describe("evaluateDispatchAddress", () => {
  it("adres yok: ne var ne düzelt", () => {
    expect(evaluateDispatchAddress([])).toEqual({
      hasDispatchAddress: false,
      needsFix: false,
    });
    expect(evaluateDispatchAddress(undefined)).toEqual({
      hasDispatchAddress: false,
      needsFix: false,
    });
  });

  it("geçerli adres: kapı açık", () => {
    expect(evaluateDispatchAddress([ok])).toEqual({
      hasDispatchAddress: true,
      needsFix: false,
    });
  });

  it("kullanılamaz kayıt: düzelt", () => {
    expect(
      evaluateDispatchAddress([{ ...ok, phone: "+902121234567" }]),
    ).toEqual({
      hasDispatchAddress: false,
      needsFix: true,
    });
    expect(evaluateDispatchAddress([{ ...ok, district: " " }]).needsFix).toBe(
      true,
    );
  });

  it("varsayılan varsa o seçilir (API ile aynı), yoksa ilk kayıt", () => {
    const bad = { ...ok, id: "2", phone: "1" };
    expect(
      evaluateDispatchAddress([ok, { ...bad, isDefault: true }])
        .hasDispatchAddress,
    ).toBe(false);
    expect(
      evaluateDispatchAddress([bad, { ...ok, isDefault: true }])
        .hasDispatchAddress,
    ).toBe(true);
    expect(evaluateDispatchAddress([bad, ok]).hasDispatchAddress).toBe(false);
  });
});
