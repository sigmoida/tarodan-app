import * as crypto from "crypto";
import { PaymentStatus, PaytrMerchant } from "@prisma/client";
import type { ConfigService } from "@nestjs/config";
import { PaymentCallbackService } from "./payment-callback.service";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PayTRCredentials } from "../../payment-providers/paytr/paytr-credentials.service";
import { PayTRReportService } from "../../payment-providers/paytr/paytr-report.service";
import { PayTRTransferService } from "../../payment-providers/paytr/paytr-transfer.service";
import { PayTRService } from "../../payment-providers/paytr/paytr.service";

/**
 * İki PayTR mağazası, iki bildirim ucu. Her uç kendi mağazasının anahtarıyla
 * doğrular; doğrulanmış bir bildirim, kaydı DİĞER mağazada alınmış bir ödemeye
 * uygulanmaz. Hash uyuşmazlığında durum-sorgu kaydın mağazasına atılır.
 */
const ENV: Record<string, string> = {
  PAYTR_MERCHANT_ID: "111111",
  PAYTR_MERCHANT_KEY: "market-key",
  PAYTR_MERCHANT_SALT: "market-salt",
  PAYTR_MEMBERSHIP_MERCHANT_ID: "222222",
  PAYTR_MEMBERSHIP_MERCHANT_KEY: "member-key",
  PAYTR_MEMBERSHIP_MERCHANT_SALT: "member-salt",
};

const SECRETS: Record<PaytrMerchant, [string, string]> = {
  [PaytrMerchant.marketplace]: ["market-key", "market-salt"],
  [PaytrMerchant.membership]: ["member-key", "member-salt"],
};

function signed(
  merchant: PaytrMerchant,
  body: { merchant_oid: string; status: string; total_amount: string },
) {
  const [key, salt] = SECRETS[merchant];
  const hash = crypto
    .createHmac("sha256", key)
    .update(`${body.merchant_oid}${salt}${body.status}${body.total_amount}`)
    .digest("base64");
  return { ...body, hash };
}

function setup(record: {
  payment?: Record<string, unknown> | null;
  recurring?: Record<string, unknown> | null;
  /** Yenilemenin sahibi test şeridi hesabı mı (recurring şerit guard'ı). */
  ownerIsTest?: boolean;
}) {
  const config = {
    get: (key: string, fallback?: string) => ENV[key] ?? fallback,
  } as unknown as ConfigService;
  const creds = new PayTRCredentials(config);
  const paytr = new PayTRService(
    creds,
    new PayTRReportService(creds),
    new PayTRTransferService(creds),
    config,
  );
  const registry = new PaymentProviderRegistry(paytr);
  const queried: Array<{ merchant: PaytrMerchant; oid: string }> = [];
  for (const merchant of Object.values(PaytrMerchant)) {
    const bound = paytr.forMerchant(merchant);
    jest.spyOn(bound, "queryPaymentStatus").mockImplementation(async (oid) => {
      queried.push({ merchant, oid });
      return { ok: false, errMsg: "not found" };
    });
  }

  const prisma = {
    payment: {
      findFirst: jest.fn().mockResolvedValue(record.payment ?? null),
    },
    membershipPayment: {
      findFirst: jest.fn().mockResolvedValue(record.recurring ?? null),
    },
    // Recurring yenilemede damga yok: şerit guard'ı sahibin bayrağını okur.
    userMembership: {
      findUnique: jest.fn().mockResolvedValue({
        user: { isTestAccount: record.ownerIsTest ?? false },
      }),
    },
  };
  const fulfillment = {
    processSuccessfulPayment: jest.fn().mockResolvedValue(true),
    processFailedPayment: jest.fn().mockResolvedValue(undefined),
  };
  const reconciliation = {
    syncSavedCardsFromUtoken: jest.fn().mockResolvedValue(1),
  };
  const events = { record: jest.fn().mockResolvedValue(undefined) };
  const cache = {
    incr: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const virtualOrder = {
    completeRecurringMembershipPayment: jest.fn().mockResolvedValue(true),
    failRecurringMembershipPayment: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new PaymentCallbackService(
    prisma as never,
    { get: () => undefined } as never,
    registry,
    { isChargeLikelyLive: () => false } as never,
    fulfillment as never,
    reconciliation as never,
    events as never,
    cache as never,
    virtualOrder as never,
  );
  return { svc, fulfillment, reconciliation, events, queried, virtualOrder };
}

const membershipPayment = {
  id: "pay-1",
  provider: "paytr",
  paytrMerchant: PaytrMerchant.membership,
  status: PaymentStatus.pending,
  amount: 199,
  orderId: "order-1",
  providerConversationId: "MEM10001T123456",
  metadata: { payerIp: "85.100.1.2" },
  order: { buyerId: "user-1", status: "pending_payment" },
};

const body = {
  merchant_oid: "MEM10001T123456",
  status: "success",
  total_amount: "19900",
};

describe("PaymentCallbackService — per-merchant routing", () => {
  it("applies a membership callback verified with the membership key", async () => {
    const { svc, fulfillment, events } = setup({ payment: membershipPayment });
    await expect(
      svc.handlePayTRCallback(
        signed(PaytrMerchant.membership, body),
        PaytrMerchant.membership,
      ),
    ).resolves.toBe("OK");
    expect(fulfillment.processSuccessfulPayment).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        paytrMerchant: PaytrMerchant.membership,
        hashValid: true,
      }),
    );
  });

  it("rejects a membership-signed callback posted to the marketplace route", async () => {
    const { svc, fulfillment, events } = setup({ payment: membershipPayment });
    await svc.handlePayTRCallback(
      signed(PaytrMerchant.membership, body),
      PaytrMerchant.marketplace,
    );
    expect(fulfillment.processSuccessfulPayment).not.toHaveBeenCalled();
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({ hashValid: false }),
    );
  });

  it("does not apply a verified callback to a record charged on the other merchant", async () => {
    const { svc, fulfillment, queried } = setup({
      payment: {
        ...membershipPayment,
        paytrMerchant: PaytrMerchant.marketplace,
      },
    });
    await expect(
      svc.handlePayTRCallback(
        signed(PaytrMerchant.membership, body),
        PaytrMerchant.membership,
      ),
    ).resolves.toBe("OK");
    expect(fulfillment.processSuccessfulPayment).not.toHaveBeenCalled();
    expect(queried).toEqual([]);
  });

  it("hash-mismatch recovery queries the record's merchant", async () => {
    const { svc, queried } = setup({ payment: membershipPayment });
    await svc.handlePayTRCallback(
      { ...body, hash: "forged" },
      PaytrMerchant.membership,
    );
    expect(queried).toEqual([
      { merchant: PaytrMerchant.membership, oid: "MEM10001T123456" },
    ]);
  });

  it("hash-mismatch on the wrong route never queries PayTR", async () => {
    const { svc, queried } = setup({ payment: membershipPayment });
    await svc.handlePayTRCallback(
      { ...body, hash: "forged" },
      PaytrMerchant.marketplace,
    );
    expect(queried).toEqual([]);
  });

  it("syncs the stored card on the charging merchant with the payer IP as mandate", async () => {
    const { svc, reconciliation, fulfillment } = setup({
      payment: membershipPayment,
    });
    await svc.handlePayTRCallback(
      { ...signed(PaytrMerchant.membership, body), utoken: "ut-1" },
      PaytrMerchant.membership,
    );
    expect(reconciliation.syncSavedCardsFromUtoken).toHaveBeenCalledWith(
      "user-1",
      "ut-1",
      { ip: "85.100.1.2" },
      PaytrMerchant.membership,
    );
    // Kart, üyelik aktivasyonundan ÖNCE yazılır: autoRenew kararı (D1) onu görür.
    expect(
      reconciliation.syncSavedCardsFromUtoken.mock.invocationCallOrder[0],
    ).toBeLessThan(
      fulfillment.processSuccessfulPayment.mock.invocationCallOrder[0],
    );
  });

  it("completes a recurring renewal only on the membership route", async () => {
    const recurring = {
      id: "mp-1",
      provider: "paytr",
      paytrMerchant: PaytrMerchant.membership,
      status: PaymentStatus.processing,
      amount: 199,
      membershipId: "m-1",
      metadata: {},
    };
    const renewal = { ...body, merchant_oid: "RENabc" };

    const wrong = setup({ recurring });
    await wrong.svc.handlePayTRCallback(
      signed(PaytrMerchant.marketplace, renewal),
      PaytrMerchant.marketplace,
    );
    expect(
      wrong.virtualOrder.completeRecurringMembershipPayment,
    ).not.toHaveBeenCalled();

    const right = setup({ recurring });
    await right.svc.handlePayTRCallback(
      signed(PaytrMerchant.membership, renewal),
      PaytrMerchant.membership,
    );
    expect(
      right.virtualOrder.completeRecurringMembershipPayment,
    ).toHaveBeenCalledWith("mp-1", "RENabc", expect.anything());
  });

  /**
   * Test şeridi (prod'da simetrik guard): bildirimin `test_mode`u kaydın
   * şeridiyle eşleşmek zorunda — iki mağazada da. İlk üyelik alımı Payment
   * satırıdır (damga siparişten), yenileme MembershipPayment'tır (damga yok,
   * sahibin bayrağı).
   */
  describe("test lane on the membership merchant", () => {
    const originalEnv = process.env.NODE_ENV;
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });
    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    const recurring = {
      id: "mp-1",
      provider: "paytr",
      paytrMerchant: PaytrMerchant.membership,
      status: PaymentStatus.processing,
      amount: 199,
      membershipId: "m-1",
      metadata: {},
    };
    const renewal = { ...body, merchant_oid: "RENabc" };

    it("applies a test-mode initial membership payment of a test-lane buyer", async () => {
      const { svc, fulfillment } = setup({
        payment: { ...membershipPayment, isTest: true },
      });
      await svc.handlePayTRCallback(
        { ...signed(PaytrMerchant.membership, body), test_mode: "1" },
        PaytrMerchant.membership,
      );
      expect(fulfillment.processSuccessfulPayment).toHaveBeenCalledTimes(1);
    });

    it("rejects a live-mode success for a test-lane initial membership payment", async () => {
      const { svc, fulfillment } = setup({
        payment: { ...membershipPayment, isTest: true },
      });
      await svc.handlePayTRCallback(
        { ...signed(PaytrMerchant.membership, body), test_mode: "0" },
        PaytrMerchant.membership,
      );
      expect(fulfillment.processSuccessfulPayment).not.toHaveBeenCalled();
    });

    it("rejects a test-mode success for a live initial membership payment", async () => {
      const { svc, fulfillment } = setup({
        payment: { ...membershipPayment, isTest: false },
      });
      await svc.handlePayTRCallback(
        { ...signed(PaytrMerchant.membership, body), test_mode: "1" },
        PaytrMerchant.membership,
      );
      expect(fulfillment.processSuccessfulPayment).not.toHaveBeenCalled();
    });

    it("completes a test-mode renewal of a test-lane owner", async () => {
      const { svc, virtualOrder } = setup({ recurring, ownerIsTest: true });
      await svc.handlePayTRCallback(
        { ...signed(PaytrMerchant.membership, renewal), test_mode: "1" },
        PaytrMerchant.membership,
      );
      expect(
        virtualOrder.completeRecurringMembershipPayment,
      ).toHaveBeenCalledWith("mp-1", "RENabc", expect.anything());
    });

    it("rejects a live-mode renewal success of a test-lane owner, and a test-mode one of a live owner", async () => {
      const testOwner = setup({ recurring, ownerIsTest: true });
      await testOwner.svc.handlePayTRCallback(
        { ...signed(PaytrMerchant.membership, renewal), test_mode: "0" },
        PaytrMerchant.membership,
      );
      expect(
        testOwner.virtualOrder.completeRecurringMembershipPayment,
      ).not.toHaveBeenCalled();

      const liveOwner = setup({ recurring, ownerIsTest: false });
      await liveOwner.svc.handlePayTRCallback(
        { ...signed(PaytrMerchant.membership, renewal), test_mode: "1" },
        PaytrMerchant.membership,
      );
      expect(
        liveOwner.virtualOrder.completeRecurringMembershipPayment,
      ).not.toHaveBeenCalled();
    });
  });
});
