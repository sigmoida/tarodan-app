import { distanceSalesGateDecision } from "./distance-sales-gate";

describe("distanceSalesGateDecision", () => {
  it("onay geldi, kayıt yok → kaydet", () => {
    expect(
      distanceSalesGateDecision({
        hasRecord: false,
        accepted: true,
        required: true,
      }),
    ).toBe("record");
  });

  it("kayıt varsa (checkout'ta alındı) yeni onay ikinci satır yazdırmaz", () => {
    expect(
      distanceSalesGateDecision({
        hasRecord: true,
        accepted: true,
        required: true,
      }),
    ).toBe("proceed");
  });

  it("kayıt varsa onay gönderilmese de ödeme başlar", () => {
    expect(
      distanceSalesGateDecision({
        hasRecord: true,
        accepted: false,
        required: true,
      }),
    ).toBe("proceed");
  });

  it("zorunluluk AÇIKKEN kayıtsız ve onaysız ödeme reddedilir", () => {
    expect(
      distanceSalesGateDecision({
        hasRecord: false,
        accepted: false,
        required: true,
      }),
    ).toBe("reject");
  });

  it("zorunluluk KAPALIYKEN (varsayılan) eski mobil istemci ödemeye devam eder", () => {
    expect(
      distanceSalesGateDecision({
        hasRecord: false,
        accepted: false,
        required: false,
      }),
    ).toBe("unrecorded");
  });
});
