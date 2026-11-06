// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import { fmtTry } from "@/lib/format";
import { bodyText, mount, type Mounted } from "@/test-utils/dom";
import type { OrderGroupFile } from "../_lib/fileTypes";
import { GroupPaymentCard } from "./GroupPaymentCard";

const F = "admin.operations.orders.file";
const INSTALLMENT = "admin.finance.payments.installment.title";

type FilePayment = NonNullable<OrderGroupFile["payment"]>;

const file = (payment: Partial<FilePayment>): OrderGroupFile =>
  ({
    shippingAddress: null,
    group: {
      kind: "synthetic",
      id: "o1",
      groupNumber: "ORD-1",
      createdAt: "2026-11-01T10:00:00.000Z",
      itemCount: 1,
      packageCount: 1,
      isMultiSeller: false,
      totals: {
        subtotal: 1000,
        shippingCost: 0,
        discountAmount: 0,
        totalAmount: 1000,
      },
    },
    buyer: null,
    payment: {
      id: "pay-1",
      status: "completed",
      amount: 1000,
      provider: "paytr",
      providerPaymentId: null,
      paytrOid: null,
      paytrOidHistory: [],
      paidAt: "2026-11-01T10:05:00.000Z",
      coversWholeGroup: false,
      refundedTotal: 0,
      ...payment,
    },
    packages: [],
  }) as OrderGroupFile;

/** The value next to a `DataList` label. */
const valueOf = (label: string) => {
  const term = Array.from(document.body.querySelectorAll("dt")).find(
    (el) => el.textContent?.trim() === label,
  );
  return term?.nextElementSibling?.textContent ?? null;
};

let view: Mounted;
afterEach(() => view.unmount());

describe("GroupPaymentCard installment terms", () => {
  it("shows what the card was charged, the count and the fee of an installment payment", () => {
    view = mount(
      <GroupPaymentCard
        file={file({
          installmentCount: 3,
          installmentFeeAmount: 62.4,
          chargedAmount: 1062.4,
        })}
      />,
    );

    expect(valueOf(`${F}.chargedTotal`)).toBe(fmtTry(1062.4));
    expect(valueOf(INSTALLMENT)).toBe(
      `admin.finance.installments.rules.countSingle|${JSON.stringify({ count: 3 })}`,
    );
    expect(valueOf("admin.finance.installments.preview.columns.fee")).toBe(
      fmtTry(62.4),
    );
  });

  it("takes a partial refund off the charged amount (both PSP scale)", () => {
    view = mount(
      <GroupPaymentCard
        file={file({
          installmentCount: 3,
          installmentFeeAmount: 62.4,
          chargedAmount: 1062.4,
          refundedTotal: 531.2,
        })}
      />,
    );

    expect(valueOf(`${F}.remainingChargedTotal`)).toBe(fmtTry(531.2));
  });

  it("shows no remaining amount once refund attempts add up to the charge", () => {
    view = mount(
      <GroupPaymentCard
        file={file({
          installmentCount: 3,
          installmentFeeAmount: 62.4,
          chargedAmount: 1062.4,
          // A float sum of three attempts, a hair under C.
          refundedTotal: 354.13 + 354.13 + 354.14 - 1e-9,
        })}
      />,
    );

    expect(valueOf(`${F}.remainingChargedTotal`)).toBeNull();
  });

  it("keeps a single or legacy payment to its amount, without installment lines", () => {
    view = mount(<GroupPaymentCard file={file({})} />);

    expect(valueOf(`${F}.chargedTotal`)).toBe(fmtTry(1000));
    expect(bodyText()).not.toContain(INSTALLMENT);
  });
});
