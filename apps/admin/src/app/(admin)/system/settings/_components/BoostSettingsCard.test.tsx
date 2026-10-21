// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSetting: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/api", () => ({
  adminApi: { getSettings: h.getSettings, updateSetting: h.updateSetting },
}));

import {
  bodyText,
  button,
  click,
  field,
  flush,
  mount,
  type Mounted,
} from "@/test-utils/dom";
import { BoostSettingsCard } from "./BoostSettingsCard";

const SAVE = "admin.settings.saveButton";
let view: Mounted;

const toggle = () => field<HTMLButtonElement>('[role="switch"]');

async function render(settings: Record<string, string>) {
  h.getSettings.mockResolvedValue({ data: settings });
  view = mount(<BoostSettingsCard />);
  await flush();
}

beforeEach(() => {
  h.getSettings.mockReset();
  h.updateSetting.mockReset().mockResolvedValue({ data: {} });
  h.toast.success.mockReset();
});

afterEach(() => view.unmount());

describe("BoostSettingsCard", () => {
  it("shows boost sales on when boost_enabled was never written", async () => {
    await render({});
    expect(bodyText()).toContain("admin.settings.boost.enabled");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it.each([
    ["false", "false"],
    [" FALSE ", "false"],
    ["true", "true"],
    ["", "true"],
  ])("reads boost_enabled %j as on=%s (isBoostEnabled)", async (value, on) => {
    await render({ boost_enabled: value });
    expect(toggle().getAttribute("aria-checked")).toBe(on);
  });

  it("writes 'false' when an admin turns boost sales off", async () => {
    await render({});
    await click(toggle());
    expect(h.updateSetting).toHaveBeenCalledWith("boost_enabled", "false");
    expect(h.toast.success).toHaveBeenCalledWith("admin.settings.saved");
  });

  it("writes 'true' when boost sales are turned back on", async () => {
    await render({ boost_enabled: "false" });
    await click(toggle());
    expect(h.updateSetting).toHaveBeenCalledWith("boost_enabled", "true");
  });

  it("saves the offer start as that Istanbul day's midnight", async () => {
    // 21:30Z is already the next day in Istanbul.
    await render({ boost_offer_since: "2026-10-31T21:30:00.000Z" });
    await click(button(SAVE));
    expect(h.updateSetting).toHaveBeenCalledWith(
      "boost_offer_since",
      "2026-11-01T00:00:00.000+03:00",
    );
  });

  it("saves an empty offer start (offers off) once the date is cleared", async () => {
    await render({ boost_offer_since: "2026-11-01T00:00:00.000+03:00" });
    await click(field<HTMLButtonElement>('button[aria-haspopup="dialog"]'));
    await click(button("Temizle"));
    await click(button(SAVE));
    expect(h.updateSetting).toHaveBeenCalledWith("boost_offer_since", "");
  });

  it("treats a missing or invalid offer start as off", async () => {
    await render({ boost_offer_since: "not a date" });
    await click(button(SAVE));
    expect(h.updateSetting).toHaveBeenCalledWith("boost_offer_since", "");
  });
});
