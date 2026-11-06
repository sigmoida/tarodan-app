// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminPaymentChargeAttempt,
  AdminPaymentInstallment,
  AdminPaymentInstallmentPricing,
} from "@tarodan/types";

const h = vi.hoisted(() => ({
  getPayment: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT, useLocale: () => "tr" };
});
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "pay-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/finance/payments/pay-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ user: { id: "staff-1", role: "admin" } }),
}));
vi.mock("@/lib/api", () => ({
  adminApi: { getPayment: h.getPayment },
}));

import { membershipTierConfig } from "@tarodan/shared";
import { PermissionsProvider } from "@/context/PermissionsContext";
import { fmtTry } from "@/lib/format";
import { bodyText, flush, mount, type Mounted } from "@/test-utils/dom";
import type { PaymentDetail } from "./types";
import PaymentDetailPage from "./page";

const L = "admin.finance.payments.installment";
const COUNT = "admin.finance.installments.rules.countSingle";
const countLabel = (count: number) => `${COUNT}|${JSON.stringify({ count })}`;

const attempt = (
  over: Partial<AdminPaymentChargeAttempt> = {},
): AdminPaymentChargeAttempt => ({
  id: "att-1",
  merchantOid: "TRDOIDSINGLE1",
  installmentCount: 1,
  chargedAmount: 1000,
  installmentFeeAmount: 0,
  capturedAt: "2026-11-01T10:05:00.000Z",
  applied: true,
  createdAt: "2026-11-01T10:00:00.000Z",
  ...over,
});

const pricing = (
  over: Partial<AdminPaymentInstallmentPricing> = {},
): AdminPaymentInstallmentPricing => ({
  merchantOid: "TRDOIDINST2",
  buyerSegment: "premium",
  rule: {
    id: "rule-v2",
    lineageId: "rule-v1",
    version: 2,
    name: "Premium half price",
  },
  platformSharePct: 50,
  platformCostAmount: 31.2,
  cardFamily: "world",
  cardBank: "Example Bank",
  cardType: "credit",
  businessCard: false,
  ...over,
});

const singleInstallment = (
  over: Partial<AdminPaymentInstallment> = {},
): AdminPaymentInstallment => ({
  installmentCount: 1,
  goodsAmount: 1000,
  installmentFeeAmount: 0,
  chargedAmount: 1000,
  pricing: pricing({
    merchantOid: "TRDOIDSINGLE1",
    rule: null,
    platformSharePct: 0,
    platformCostAmount: 0,
  }),
  chargeAttempts: [attempt()],
  ...over,
});

const installmentPayment = (
  over: Partial<AdminPaymentInstallment> = {},
): AdminPaymentInstallment => ({
  installmentCount: 3,
  goodsAmount: 1000,
  installmentFeeAmount: 62.4,
  chargedAmount: 1062.4,
  pricing: pricing(),
  chargeAttempts: [
    attempt({
      id: "att-2",
      merchantOid: "TRDOIDINST2",
      installmentCount: 3,
      chargedAmount: 1062.4,
      installmentFeeAmount: 62.4,
      capturedAt: "2026-11-01T10:05:00.000Z",
      createdAt: "2026-11-01T10:03:00.000Z",
    }),
    attempt({
      id: "att-1",
      merchantOid: "TRDOIDOLD1",
      installmentCount: 2,
      chargedAmount: 1040.5,
      installmentFeeAmount: 40.5,
      capturedAt: null,
      applied: false,
    }),
  ],
  ...over,
});

const payment = (over: Partial<PaymentDetail> = {}): PaymentDetail => ({
  id: "pay-1",
  sourceType: "order",
  orderId: null,
  orderNumber: null,
  amount: 1000,
  currency: "TRY",
  provider: "paytr",
  status: "completed",
  order: null,
  group: null,
  trade: null,
  refundedTotal: 0,
  paymentHolds: [],
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:05:00.000Z",
  paidAt: "2026-11-01T10:05:00.000Z",
  ...over,
});

let view: Mounted;

async function render(data: PaymentDetail) {
  h.getPayment.mockResolvedValue({ data });
  view = mount(
    <PermissionsProvider
      permissions={{ isSuperAdmin: false, keys: ["payments"] }}
    >
      <PaymentDetailPage />
    </PermissionsProvider>,
  );
  await flush();
}

/** The text of the section card titled `title` (h2 -> header -> card). */
const section = (title: string): string | null => {
  const heading = Array.from(document.body.querySelectorAll("h2")).find(
    (el) => el.textContent?.trim() === title,
  );
  return heading?.parentElement?.parentElement?.textContent ?? null;
};

beforeEach(() => {
  h.getPayment.mockReset();
  // The table's truncating cells measure themselves.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => {
  view.unmount();
  vi.unstubAllGlobals();
});

describe("payment detail installment block", () => {
  it("shows a single payment as one compact line, without the installment card", async () => {
    await render(payment({ installment: singleInstallment() }));

    expect(bodyText()).toContain(`${L}.title`);
    expect(bodyText()).toContain(`${L}.single`);
    expect(bodyText()).not.toContain(`${L}.goodsAmount`);
    expect(bodyText()).not.toContain(`${L}.platformCost`);
    expect(bodyText()).not.toContain(`${L}.chargedAmount`);
    // The signed form is still listed.
    expect(bodyText()).toContain(`${L}.attempts.title`);
    expect(bodyText()).toContain("TRDOIDSINGLE1");
  });

  it("shows count, fee against the goods amount, charged total and the pricing snapshot", async () => {
    await render(payment({ installment: installmentPayment() }));

    const card = section(`${L}.title`);
    expect(card).not.toBeNull();
    expect(card).toContain(countLabel(3));
    expect(card).toContain(fmtTry(1000));
    expect(card).toContain(fmtTry(62.4));
    expect(card).toContain(fmtTry(1062.4));
    expect(card).toContain(`world · Example Bank · ${L}.cardTypes.credit`);
    expect(card).not.toContain(`${L}.businessCard`);
    expect(card).toContain(membershipTierConfig.premium.labelKey);
    expect(card).toContain(
      `admin.finance.installments.rules.nameVersion|${JSON.stringify({
        name: "Premium half price",
        version: 2,
      })}`,
    );
    expect(card).toContain("%50");
    expect(card).toContain(fmtTry(31.2));
    expect(card).not.toContain(`${L}.noPricing`);
  });

  it("names the default rule when none won the pricing", async () => {
    await render(
      payment({
        installment: installmentPayment({
          pricing: pricing({ rule: null, buyerSegment: "guest" }),
        }),
      }),
    );

    const card = section(`${L}.title`);
    expect(card).toContain("admin.finance.installments.preview.defaultRule");
    expect(card).toContain("admin.finance.installments.segments.guest");
  });

  it("lists every charge attempt with count, amount, fee and whether it was captured", async () => {
    await render(payment({ installment: installmentPayment() }));

    const rows = Array.from(document.body.querySelectorAll("tbody tr")).map(
      (row) => row.textContent ?? "",
    );
    const captured = rows.find((row) => row.includes("TRDOIDINST2"));
    const superseded = rows.find((row) => row.includes("TRDOIDOLD1"));
    expect(captured).toContain(countLabel(3));
    expect(captured).toContain(fmtTry(1062.4));
    expect(captured).toContain(`${L}.attempts.applied`);
    expect(superseded).toContain(countLabel(2));
    expect(superseded).toContain(fmtTry(1040.5));
    expect(superseded).toContain(fmtTry(40.5));
    expect(superseded).toContain(`${L}.notCaptured`);
  });

  it("flags a captured attempt the payment is not booked from as a second charge", async () => {
    await render(
      payment({
        installment: singleInstallment({
          chargeAttempts: [
            attempt({
              id: "att-late",
              merchantOid: "TRDOIDLATE",
              applied: false,
            }),
            attempt(),
          ],
        }),
      }),
    );

    const rows = Array.from(document.body.querySelectorAll("tbody tr")).map(
      (row) => row.textContent ?? "",
    );
    expect(rows.find((row) => row.includes("TRDOIDLATE"))).toContain(
      `${L}.attempts.capturedNotApplied`,
    );
    expect(rows.find((row) => row.includes("TRDOIDSINGLE1"))).toContain(
      `${L}.attempts.applied`,
    );
  });

  it("shows the charged amount next to the goods amount and refunds of an installment payment", async () => {
    await render(
      payment({ refundedTotal: 1062.4, installment: installmentPayment() }),
    );
    const info = section("admin.finance.payments.paymentInfo");
    expect(info).toContain(`${L}.chargedAmount`);
    expect(info).toContain(fmtTry(1062.4));
  });

  it("warns instead of guessing when an installment payment has no pricing record", async () => {
    await render(
      payment({ installment: installmentPayment({ pricing: null }) }),
    );

    const card = section(`${L}.title`);
    expect(card).toContain(fmtTry(1062.4));
    expect(card).toContain(`${L}.noPricing`);
    expect(card).not.toContain(`${L}.platformCost`);
  });

  it("does not call an unpaid payment a single payment while its form is signed for installments", async () => {
    await render(
      payment({
        status: "pending",
        paidAt: undefined,
        installment: singleInstallment({
          pricing: null,
          chargeAttempts: [
            attempt({
              merchantOid: "TRDOIDPENDING",
              installmentCount: 3,
              chargedAmount: 1062.4,
              installmentFeeAmount: 62.4,
              capturedAt: null,
              applied: false,
            }),
          ],
        }),
      }),
    );

    expect(bodyText()).toContain(`${L}.notCaptured`);
    expect(bodyText()).not.toContain(`${L}.single`);
    expect(bodyText()).not.toContain(`${L}.goodsAmount`);
    expect(bodyText()).toContain("TRDOIDPENDING");
  });

  it("shows a legacy single payment without an attempts list", async () => {
    await render(
      payment({
        installment: singleInstallment({ pricing: null, chargeAttempts: [] }),
      }),
    );

    expect(bodyText()).toContain(`${L}.single`);
    expect(bodyText()).not.toContain(`${L}.attempts.title`);
  });

  it("renders nothing installment-related when the API sends no block", async () => {
    await render(payment());

    expect(bodyText()).toContain("admin.finance.payments.paymentInfo");
    expect(bodyText()).not.toContain(`${L}.`);
  });
});
