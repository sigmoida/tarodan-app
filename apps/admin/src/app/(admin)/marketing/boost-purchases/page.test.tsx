// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  role: "admin",
  getBoostPurchases: vi.fn(),
  get: vi.fn(),
}));

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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/marketing/boost-purchases",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ user: { id: "staff-1", role: h.role } }),
}));
vi.mock("@/lib/api", () => ({
  adminApi: { getBoostPurchases: h.getBoostPurchases, get: h.get },
}));

import { PermissionsProvider } from "@/context/PermissionsContext";
import type { Permissions } from "@/lib/server/permissions";
import {
  click,
  dialogs,
  findButton,
  flush,
  mount,
  type Mounted,
} from "@/test-utils/dom";
import BoostPurchasesPage from "./page";

const GRANT = "admin.marketing.boostPurchases.grant.action";
let view: Mounted;

async function render(role: string, permissions: Permissions) {
  h.role = role;
  view = mount(
    <PermissionsProvider permissions={permissions}>
      <BoostPurchasesPage />
    </PermissionsProvider>,
  );
  await flush();
}

const staff = (...keys: string[]): Permissions => ({
  isSuperAdmin: false,
  keys,
});

beforeEach(() => {
  h.getBoostPurchases.mockReset().mockResolvedValue({
    data: { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } },
  });
  h.get.mockReset().mockResolvedValue({ data: [] });
});

afterEach(() => view.unmount());

describe("boost purchases list: free grant", () => {
  it("offers the grant to an admin with ads and opens the form", async () => {
    await render("admin", staff("ads"));
    await click(findButton(GRANT)!);
    expect(dialogs()).toHaveLength(1);
    expect(
      document.body.querySelector('input[name="productId"]'),
    ).not.toBeNull();
  });

  it("offers it to a super admin", async () => {
    await render("super_admin", { isSuperAdmin: true, keys: [] });
    expect(findButton(GRANT)).toBeDefined();
  });

  it.each([
    ["an admin without ads", "admin", staff("payments")],
    ["a moderator, even with ads", "moderator", staff("ads", "payments")],
  ])("hides it from %s", async (_label, role, permissions) => {
    await render(role, permissions);
    expect(findButton(GRANT)).toBeUndefined();
  });
});
