// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  grantBoost: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/api", () => ({ adminApi: { grantBoost: h.grantBoost } }));

import {
  apiError,
  bodyText,
  button,
  click,
  dialogs,
  field,
  mount,
  type,
  type Mounted,
} from "@/test-utils/dom";
import { GrantBoostModal } from "./GrantBoostModal";

const ACTION = "admin.marketing.boostPurchases.grant.action";
const NO_INVOICE = "admin.marketing.boostPurchases.grant.noInvoiceHint";
const REASON = "Compensation for the outage on Monday";

const onClose = vi.fn();
let view: Mounted;

const listing = () => field('input[name="productId"]');
const days = () => field('input[name="durationDays"]');
const reason = () => field<HTMLTextAreaElement>('textarea[name="reason"]');
const topDialog = () => dialogs().at(-1)!;

async function fill(values: {
  listing?: string;
  days?: string;
  reason?: string;
}) {
  if (values.listing !== undefined) await type(listing(), values.listing);
  if (values.days !== undefined) await type(days(), values.days);
  if (values.reason !== undefined) await type(reason(), values.reason);
}

beforeEach(() => {
  h.grantBoost.mockReset().mockResolvedValue({ data: { id: "g1" } });
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  onClose.mockReset();
  view = mount(
    <GrantBoostModal
      packages={[{ value: "pkg-1", label: "Vitrin" }]}
      onClose={onClose}
    />,
  );
});

afterEach(() => view.unmount());

describe("GrantBoostModal", () => {
  it("says a free grant has no invoice and starts at 7 days without a package", () => {
    expect(bodyText()).toContain(NO_INVOICE);
    expect(days().value).toBe("7");
    expect(bodyText()).toContain(
      "admin.marketing.boostPurchases.grant.noPackage",
    );
  });

  it("requires the listing and a reason", async () => {
    await click(button(ACTION, dialogs()[0]));
    expect(bodyText()).toContain("common.required");
    expect(dialogs()).toHaveLength(1);
    expect(h.grantBoost).not.toHaveBeenCalled();
  });

  it.each([
    ["0", 'validation.minValue|{"min":1}'],
    ["91", 'validation.maxValue|{"max":90}'],
  ])("refuses %s days with the shared limits", async (value, message) => {
    await fill({ listing: "U010001", days: value, reason: REASON });
    await click(button(ACTION, dialogs()[0]));
    expect(bodyText()).toContain(message);
    expect(h.grantBoost).not.toHaveBeenCalled();
  });

  it("confirms, then grants without a package", async () => {
    await fill({ listing: " u010001 ", days: "14", reason: REASON });
    await click(button(ACTION, dialogs()[0]));
    expect(topDialog().textContent).toContain(NO_INVOICE);
    await click(button(ACTION, topDialog()));

    expect(h.grantBoost).toHaveBeenCalledWith({
      productId: "u010001",
      durationDays: 14,
      reason: REASON,
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      "admin.marketing.boostPurchases.grant.done",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("sends nothing when the confirm is declined", async () => {
    await fill({ listing: "U010001", reason: REASON });
    await click(button(ACTION, dialogs()[0]));
    await click(button("common.cancel", topDialog()));
    expect(h.grantBoost).not.toHaveBeenCalled();
  });

  it("shows a listing that is not live as a refusal and stays open", async () => {
    h.grantBoost.mockRejectedValue(
      apiError(400, "server.admin.boost.grantListingNotActive"),
    );
    await fill({ listing: "U010001", reason: REASON });
    await click(button(ACTION, dialogs()[0]));
    await click(button(ACTION, topDialog()));

    expect(h.toast.error).toHaveBeenCalledWith(
      "server:server.admin.boost.grantListingNotActive",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
