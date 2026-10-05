import { describe, expect, it } from "vitest";
import {
  REQUIRED_STEPS,
  activeRequiredStep,
  isRequiredStepExemptPath,
  requiredStepState,
} from "./requiredSteps";

describe("activeRequiredStep — kapılar üst üste binmez", () => {
  it("iki adım da bekliyorsa YALNIZ ilki (onaylar) gösterilir", () => {
    expect(
      activeRequiredStep({ consents: "pending", legalIdentity: "pending" }),
    ).toBe("consents");
  });

  it("onaylar tamamlanınca kimlik adımı gelir", () => {
    expect(
      activeRequiredStep({ consents: "done", legalIdentity: "pending" }),
    ).toBe("legalIdentity");
  });

  it("onay durumu yüklenirken kimlik penceresi açılmaz (göz kırpma yok)", () => {
    expect(
      activeRequiredStep({ consents: "unknown", legalIdentity: "pending" }),
    ).toBeNull();
  });

  it("hepsi tamamsa kapı kapalıdır", () => {
    expect(
      activeRequiredStep({ consents: "done", legalIdentity: "done" }),
    ).toBeNull();
  });

  it("sıra hukuki önceliktir: önce onaylar, sonra kimlik", () => {
    expect(REQUIRED_STEPS).toEqual(["consents", "legalIdentity"]);
  });
});

describe("requiredStepState", () => {
  it("giriş yapmamış ziyaretçide adım yoktur", () => {
    expect(
      requiredStepState({ enabled: false, isPending: true, needed: true }),
    ).toBe("done");
  });

  it("ilk veri gelene kadar bilinmiyor", () => {
    expect(
      requiredStepState({ enabled: true, isPending: true, needed: false }),
    ).toBe("unknown");
  });

  it("veri gelince yapılacak bir şey varsa bekliyor", () => {
    expect(
      requiredStepState({ enabled: true, isPending: false, needed: true }),
    ).toBe("pending");
    expect(
      requiredStepState({ enabled: true, isPending: false, needed: false }),
    ).toBe("done");
  });
});

describe("isRequiredStepExemptPath", () => {
  it("yasal metin sayfaları her zorunlu adımdan muaftır (okunabilsin)", () => {
    expect(isRequiredStepExemptPath("/terms")).toBe(true);
    expect(isRequiredStepExemptPath("/privacy")).toBe(true);
    expect(isRequiredStepExemptPath("/profile")).toBe(false);
  });
});
