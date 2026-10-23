// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  revokeBoostGrant: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/api", () => ({
  adminApi: { revokeBoostGrant: h.revokeBoostGrant },
}));

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
import { RevokeGrantModal } from "./RevokeGrantModal";

const ACTION = "admin.marketing.boostPurchases.revoke.action";
const CONFIRM_TEXT = "admin.marketing.boostPurchases.revoke.confirm";
const REASON = "Granted to the wrong listing";

const onClose = vi.fn();
let view: Mounted;

const reason = () => field<HTMLTextAreaElement>('textarea[name="reason"]');
const topDialog = () => dialogs().at(-1)!;

beforeEach(() => {
  h.revokeBoostGrant.mockReset().mockResolvedValue({ data: { id: "g1" } });
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  onClose.mockReset();
  view = mount(<RevokeGrantModal purchaseId="g1" onClose={onClose} />);
});

afterEach(() => view.unmount());

describe("RevokeGrantModal", () => {
  it("requires a reason of 10 to 500 characters", async () => {
    await type(reason(), "short");
    await click(button(ACTION, dialogs()[0]));
    expect(bodyText()).toContain('validation.minLength|{"min":10}');

    await type(reason(), "x".repeat(501));
    await click(button(ACTION, dialogs()[0]));
    expect(bodyText()).toContain('validation.maxLength|{"max":500}');

    expect(dialogs()).toHaveLength(1);
    expect(h.revokeBoostGrant).not.toHaveBeenCalled();
  });

  it("confirms before it stops the grant, and a declined confirm sends nothing", async () => {
    await type(reason(), REASON);
    await click(button(ACTION, dialogs()[0]));
    expect(topDialog().textContent).toContain(CONFIRM_TEXT);
    await click(button("common.cancel", topDialog()));
    expect(h.revokeBoostGrant).not.toHaveBeenCalled();
  });

  it("sends only the trimmed reason after the confirm", async () => {
    await type(reason(), ` ${REASON} `);
    await click(button(ACTION, dialogs()[0]));
    await click(button(ACTION, topDialog()));

    expect(h.revokeBoostGrant).toHaveBeenCalledWith("g1", { reason: REASON });
    expect(h.toast.success).toHaveBeenCalledWith(
      "admin.marketing.boostPurchases.revoke.done",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a refusal (not a grant) and stays open", async () => {
    h.revokeBoostGrant.mockRejectedValue(
      apiError(400, "server.admin.boost.revokeGrantOnly"),
    );
    await type(reason(), REASON);
    await click(button(ACTION, dialogs()[0]));
    await click(button(ACTION, topDialog()));

    expect(h.toast.error).toHaveBeenCalledWith(
      "server:server.admin.boost.revokeGrantOnly",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
