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

import { apiError, bodyText, mount, type Mounted } from "@/test-utils/dom";
import {
  BoostRefundRedirectAlert,
  isBoostRefundRedirect,
} from "./BoostRefundRedirectAlert";

let view: Mounted | undefined;
afterEach(() => view?.unmount());

describe("isBoostRefundRedirect", () => {
  it("recognises only the boost screen refusal", () => {
    expect(
      isBoostRefundRedirect(
        apiError(400, "server.admin.payment.boostRefundUseBoostScreen"),
      ),
    ).toBe(true);
    expect(
      isBoostRefundRedirect(
        apiError(400, "server.admin.boost.refundNotAllowed"),
      ),
    ).toBe(false);
    expect(isBoostRefundRedirect(null)).toBe(false);
  });
});

describe("BoostRefundRedirectAlert", () => {
  it("says to use the boost screen and links to it", () => {
    view = mount(<BoostRefundRedirectAlert />);
    expect(bodyText()).toContain(
      "server.admin.payment.boostRefundUseBoostScreen",
    );
    const link = document.body.querySelector<HTMLAnchorElement>(
      'a[href="/marketing/boost-purchases"]',
    );
    expect(link?.textContent).toBe("admin.marketing.boostPurchases.title");
  });
});
