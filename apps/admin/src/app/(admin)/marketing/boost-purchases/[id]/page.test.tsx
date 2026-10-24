// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getBoostPurchase: vi.fn(),
  role: "admin",
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
  useParams: () => ({ id: "boost-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/marketing/boost-purchases/boost-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ user: { id: "staff-1", role: h.role } }),
}));
vi.mock("@/lib/api", () => ({
  adminApi: { getBoostPurchase: h.getBoostPurchase },
}));

import { PermissionsProvider } from "@/context/PermissionsContext";
import type { Permissions } from "@/lib/server/permissions";
import {
  bodyText,
  click,
  dialogs,
  findButton,
  flush,
  mount,
  type Mounted,
} from "@/test-utils/dom";
import type { BoostPurchase } from "../_lib/types";
import BoostPurchaseDetailPage from "./page";

const REFUND = "admin.marketing.boostPurchases.refund.action";
const REVOKE = "admin.marketing.boostPurchases.revoke.action";
const PAUSE = "admin.marketing.boostPurchases.pause";
const EXTEND = "admin.marketing.boostPurchases.extend";

const purchase = (over: Partial<BoostPurchase> = {}): BoostPurchase => ({
  id: "boost-1",
  buyer: null,
  product: { id: "p1", title: "Model car", status: "active" },
  packageName: "Vitrin",
  showcaseOnHome: false,
  durationDays: 7,
  extendedDays: 0,
  price: 59,
  status: "active",
  startsAt: "2026-10-20T09:00:00.000Z",
  endsAt: "2026-10-27T09:00:00.000Z",
  pausedAt: null,
  purchasedAt: "2026-10-20T09:00:00.000Z",
  remainingSeconds: 3600,
  showcaseEndsAt: null,
  source: "purchase",
  grantedBy: null,
  grantReason: null,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  refundedAmount: 0,
  refundableAmount: 59,
  orderId: "order-1",
  orderNumber: "BST-1001",
  paymentId: "pay-1",
  metrics: {
    before: null,
    current: { views: 0, likes: 0, clicks: 0 },
    gain: null,
    performanceScore: null,
  },
  isBestForBuyer: false,
  createdAt: "2026-10-20T09:00:00.000Z",
  updatedAt: "2026-10-20T09:00:00.000Z",
  ...over,
});

let view: Mounted;

async function render(
  role: string,
  permissions: Permissions,
  data: BoostPurchase,
) {
  h.role = role;
  h.getBoostPurchase.mockResolvedValue({ data });
  view = mount(
    <PermissionsProvider permissions={permissions}>
      <BoostPurchaseDetailPage />
    </PermissionsProvider>,
  );
  await flush();
}

const staff = (...keys: string[]): Permissions => ({
  isSuperAdmin: false,
  keys,
});

beforeEach(() => {
  h.getBoostPurchase.mockReset();
});

afterEach(() => view.unmount());

describe("boost purchase detail actions", () => {
  it("shows a moderator no action at all", async () => {
    await render("moderator", staff("ads", "payments"), purchase());
    expect(bodyText()).toContain("BST-1001");
    for (const label of [REFUND, REVOKE, PAUSE, EXTEND]) {
      expect(findButton(label)).toBeUndefined();
    }
  });

  it("hides refund and stop from an admin without the payments permission", async () => {
    await render("admin", staff("ads"), purchase());
    expect(findButton(PAUSE)).toBeDefined();
    expect(findButton(REFUND)).toBeUndefined();
  });

  it("offers refund and stop with ads and payments, and opens the modal", async () => {
    await render("admin", staff("ads", "payments"), purchase());
    await click(findButton(REFUND)!);
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].textContent).toContain(
      "admin.marketing.boostPurchases.refund.title",
    );
  });

  it("offers a super admin cancel grant, not a refund, on a running free grant", async () => {
    await render(
      "super_admin",
      { isSuperAdmin: true, keys: [] },
      purchase({
        source: "admin_grant",
        price: 0,
        refundableAmount: 0,
        orderId: null,
        orderNumber: null,
        paymentId: null,
        grantedBy: { id: "staff-2", name: "Ops Lead" },
        grantReason: "Outage compensation",
      }),
    );
    expect(findButton(REVOKE)).toBeDefined();
    expect(findButton(REFUND)).toBeUndefined();
    expect(bodyText()).toContain("Ops Lead");
    expect(bodyText()).toContain("Outage compensation");
  });

  it("shows who stopped a refunded boost, why and how much, with no action left", async () => {
    await render(
      "admin",
      staff("ads", "payments"),
      purchase({
        status: "cancelled",
        refundableAmount: 0,
        refundedAmount: 20,
        cancelledAt: "2026-10-21T10:00:00.000Z",
        cancelledBy: { id: "staff-1", name: "Support Agent" },
        cancelReason: "Seller asked for it",
      }),
    );
    expect(bodyText()).toContain("Support Agent");
    expect(bodyText()).toContain("Seller asked for it");
    expect(bodyText()).toContain(
      "admin.marketing.boostPurchases.detail.refundedAmount",
    );
    expect(findButton(REFUND)).toBeUndefined();
    expect(findButton(EXTEND)).toBeUndefined();
  });
});
