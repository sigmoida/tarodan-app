import { PayTRService, PayTRCallbackData } from "./paytr.service";
import { PayTRCredentials } from "./paytr-credentials.service";
import { PayTRReportService } from "./paytr-report.service";
import { PayTRTransferService } from "./paytr-transfer.service";

/**
 * Gözlemlenebilirlik: PayTR Direkt API 2. adım (bildirim) dokümanı payment_type,
 * installment_count, currency, payment_amount, test_mode alanlarını da POST'lar.
 * parseCallback bunları tiplenmiş biçimde döndürmeli (önceden yalnız paymentType).
 */
describe("PayTRService.parseCallback — rich field extraction", () => {
  const config = { get: () => "" } as any;
  const svc = new PayTRService(
    new PayTRCredentials(config),
    new PayTRReportService(new PayTRCredentials(config)),
    new PayTRTransferService(new PayTRCredentials(config)),
    config,
  );

  const base: PayTRCallbackData = {
    merchant_oid: "ORD1T123456",
    status: "success",
    total_amount: "10050", // kuruş → 100.50 TL
    hash: "x",
  };

  it("taksit/currency/payment_amount/test_mode/payment_type alanlarını çıkarır", () => {
    const r = svc.parseCallback({
      ...base,
      payment_type: "card",
      installment_count: "3",
      currency: "TL",
      // Bildirim dokümanı: payment_amount CALLBACK'te ×100 (kuruş) → "10050" = 100.50 TL.
      payment_amount: "10050",
      test_mode: "1",
    });
    expect(r.orderId).toBe("ORD1T123456");
    expect(r.isSuccess).toBe(true);
    expect(r.amount).toBe(100.5); // total_amount / 100
    expect(r.paymentType).toBe("card");
    expect(r.installmentCount).toBe(3);
    expect(r.currency).toBe("TL");
    expect(r.paymentAmount).toBe(100.5); // payment_amount kuruş / 100
    expect(r.testMode).toBe(true);
  });

  it("tek çekim (installment_count '0') → 0; alanlar yoksa undefined", () => {
    const r = svc.parseCallback({ ...base, installment_count: "0" });
    expect(r.installmentCount).toBe(0);
    expect(r.paymentType).toBeUndefined();
    expect(r.currency).toBeUndefined();
    expect(r.paymentAmount).toBeUndefined();
    expect(r.testMode).toBe(false); // test_mode yok → "1" değil → false
  });

  it("payment_amount kuruş olarak parse edilir (doküman örneği 34.56 → '3456')", () => {
    const r = svc.parseCallback({ ...base, payment_amount: "3456" });
    expect(r.paymentAmount).toBe(34.56);
  });
});
