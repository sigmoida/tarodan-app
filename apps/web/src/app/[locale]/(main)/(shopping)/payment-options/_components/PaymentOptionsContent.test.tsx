/** @format */

import { describe, expect, it, vi } from "vitest";
import { serverTreeText } from "@/test-utils/serverTree";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
// Layout shells and the icon are not under test (forwardRef elements).
vi.mock("@heroicons/react/24/outline", () => ({ ShieldCheckIcon: () => null }));
vi.mock("@/components/layout/DocPage", () => ({
  DocPage: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/ui/SectionCard", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

import PaymentOptionsContent from "./PaymentOptionsContent";

describe("PaymentOptionsContent: the installment text follows the switch (plan 6.6)", () => {
  it("off: the neutral single-payment text, no installment promise", async () => {
    const text = await serverTreeText(
      await PaymentOptionsContent({ installmentsEnabled: false }),
    );
    expect(text).toContain("information.paymentOptions.installmentsDesc");
    expect(text).not.toContain(
      "information.paymentOptions.installmentsDescEnabled",
    );
  });

  it("on: where the installment options are shown", async () => {
    const text = await serverTreeText(
      await PaymentOptionsContent({ installmentsEnabled: true }),
    );
    expect(text).toContain(
      "information.paymentOptions.installmentsDescEnabled",
    );
  });
});
