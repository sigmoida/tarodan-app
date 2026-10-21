// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getRefundRequest: vi.fn(),
  approveRefundRequest: vi.fn(),
  forceFinalizeRefund: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
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
  useParams: () => ({ id: "rr-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/operations/refund-requests/rr-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ user: { id: "staff-1", role: "admin" } }),
}));
vi.mock("@/lib/api", () => ({
  adminApi: {
    getRefundRequest: h.getRefundRequest,
    approveRefundRequest: h.approveRefundRequest,
    forceFinalizeRefund: h.forceFinalizeRefund,
  },
}));
// The sections render the refund request's details; this test is about the
// page's refusal handling, so the action panel is a stub with two buttons.
vi.mock("./_components/RefundNextActionPanel", async () => {
  const { Button } = await import("@tarodan/ui");
  return {
    RefundNextActionPanel: (props: {
      onApprove: (body: object) => void;
      onFinalize: () => void;
    }) => (
      <div>
        <Button onClick={() => props.onApprove({})}>approve</Button>
        <Button onClick={props.onFinalize}>finalize</Button>
      </div>
    ),
  };
});
vi.mock("./_components/RefundStatusStepper", () => ({
  RefundStatusStepper: () => null,
}));
vi.mock("./_sections/RefundReasonSection", () => ({
  RefundReasonSection: () => null,
}));
vi.mock("./_sections/ReturnShippingSection", () => ({
  ReturnShippingSection: () => null,
}));
vi.mock("./_sections/RefundHistorySection", () => ({
  RefundHistorySection: () => null,
}));
vi.mock("./_sections/RefundTechnicalDetails", () => ({
  RefundTechnicalDetails: () => null,
}));
vi.mock("@/components/detail/PartyCard", () => ({ PartyCard: () => null }));

import {
  apiError,
  button,
  click,
  dialogs,
  flush,
  mount,
  type Mounted,
} from "@/test-utils/dom";
import RefundRequestDetailPage from "./page";

const BOOST_SCREEN = 'a[href="/marketing/boost-purchases"]';
const BOOST_REFUSAL = apiError(
  400,
  "server.admin.payment.boostRefundUseBoostScreen",
);
const party = { id: "u1", displayName: "Buyer", email: null, phone: null };

let view: Mounted;

beforeEach(async () => {
  for (const fn of [
    h.getRefundRequest,
    h.approveRefundRequest,
    h.forceFinalizeRefund,
  ]) {
    fn.mockReset();
  }
  h.getRefundRequest.mockResolvedValue({
    data: {
      id: "rr-1",
      refundNumber: "R-1",
      status: "return_delivered",
      amount: 59,
      reason: "not_as_described",
      createdAt: "2026-10-20T09:00:00.000Z",
      refundedAt: null,
      requester: party,
      order: { isTest: false, seller: party, shipment: null },
    },
  });
  view = mount(<RefundRequestDetailPage />);
  await flush();
});

afterEach(() => view.unmount());

describe("refund request detail on a boost order", () => {
  it("points an approval refused for a boost to the boost screen", async () => {
    h.approveRefundRequest.mockRejectedValue(BOOST_REFUSAL);
    expect(document.body.querySelector(BOOST_SCREEN)).toBeNull();

    await click(button("approve"));

    expect(document.body.querySelector(BOOST_SCREEN)).not.toBeNull();
  });

  it("points a force-finalize refused for a boost to the boost screen", async () => {
    h.forceFinalizeRefund.mockRejectedValue(BOOST_REFUSAL);

    await click(button("finalize"));
    await click(button("Onayla", dialogs().at(-1)));

    expect(h.forceFinalizeRefund).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector(BOOST_SCREEN)).not.toBeNull();
  });

  it("shows no boost pointer for any other refusal", async () => {
    h.approveRefundRequest.mockRejectedValue(
      apiError(400, "server.refund.invalidStatus"),
    );

    await click(button("approve"));

    expect(h.approveRefundRequest).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector(BOOST_SCREEN)).toBeNull();
  });
});
