import { BadRequestException } from "@nestjs/common";
import { PaytrMerchant } from "@prisma/client";
import { PayTRService } from "./paytr/paytr.service";
import { PayTRCredentials } from "./paytr/paytr-credentials.service";
import { PayTRReportService } from "./paytr/paytr-report.service";
import { PayTRTransferService } from "./paytr/paytr-transfer.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";
import { IPaymentProvider } from "./payment-provider.interface";

/**
 * A minimal second provider — proves IPaymentProvider is implementable by a
 * non-PayTR PSP and can act as a test double (#89 "stub for tests").
 */
class StubPaymentProvider implements IPaymentProvider {
  readonly key = "stub";
  readonly merchant = PaytrMerchant.marketplace;
  forMerchant() {
    return this;
  }
  async queryPaymentStatus() {
    return { ok: false } as any;
  }
  verifyCallback() {
    return true;
  }
  parseCallback() {
    return { orderId: "x", isSuccess: true, amount: 0 };
  }
  async createRefund() {
    return { status: "success" } as any;
  }
  async createDirectPaymentForm() {
    return {
      action: "https://example.test/pay",
      method: "POST" as const,
      fields: [],
      requireCvv: false,
    };
  }
  async chargeRecurring() {
    return { status: "success" as const };
  }
  async capiListCards() {
    return [];
  }
  async capiDeleteCard() {
    return { status: "success" };
  }
  async createPlatformTransfer() {
    return { status: "success" };
  }
  async getReturnedTransfers() {
    return [];
  }
  verifyTransferCallback() {
    return true;
  }
  async getTransactionStatement() {
    return [];
  }
  async getSettlementSummary() {
    return [];
  }
  async getSettlementDetail() {
    return [];
  }
}

describe("PaymentProviderRegistry (#89)", () => {
  const config = { get: () => undefined } as any;
  const paytr = new PayTRService(
    new PayTRCredentials(config),
    new PayTRReportService(new PayTRCredentials(config)),
    new PayTRTransferService(new PayTRCredentials(config)),
    config,
  );
  const registry = new PaymentProviderRegistry(paytr);

  it('PayTRService advertises the "paytr" key', () => {
    expect(paytr.key).toBe("paytr");
  });

  it("resolves the paytr provider by key", () => {
    expect(registry.resolve("paytr")).toBe(paytr);
  });

  it("defaults to paytr when the key is absent (behavior-preserving)", () => {
    expect(registry.resolve()).toBe(paytr);
    expect(registry.resolve(null)).toBe(paytr);
    expect(registry.resolve("")).toBe(paytr);
  });

  it("binds the provider to the record's merchant (default marketplace)", () => {
    const membership = registry.resolve("paytr", PaytrMerchant.membership);
    expect(membership.merchant).toBe(PaytrMerchant.membership);
    expect(membership).not.toBe(paytr);
    // Aynı mağaza her seferinde aynı örnek — önbellek paylaşılır.
    expect(registry.resolve(null, PaytrMerchant.membership)).toBe(membership);
    expect(membership.forMerchant(PaytrMerchant.marketplace)).toBe(paytr);
    expect(registry.resolve("paytr", null).merchant).toBe(
      PaytrMerchant.marketplace,
    );
  });

  it("throws on an unknown provider key", () => {
    expect(() => registry.resolve("stripe")).toThrow(BadRequestException);
  });

  it("IPaymentProvider is implementable by a non-PayTR provider (stub)", () => {
    const stub: IPaymentProvider = new StubPaymentProvider();
    expect(stub.key).toBe("stub");
    expect(typeof stub.createRefund).toBe("function");
  });
});
