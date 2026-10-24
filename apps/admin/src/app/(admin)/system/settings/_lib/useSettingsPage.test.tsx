// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING } from "@tarodan/types";

const getSettings = vi.fn();
const updateSetting = vi.fn();

vi.mock("@/lib/api", () => ({
  adminApi: {
    getSettings: (...args: unknown[]) => getSettings(...args),
    updateSetting: (...args: unknown[]) => updateSetting(...args),
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/system/settings",
  useSearchParams: () => new URLSearchParams("tab=security"),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { SettingToggle } from "../_components/SettingToggle";
import { useSettingsPage } from "./useSettingsPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let page: ReturnType<typeof useSettingsPage> | undefined;

/** The security tab: the numeric form plus the step-up toggle below it. */
function SecurityTab() {
  page = useSettingsPage();
  return (
    <SettingToggle
      settingKey={REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING}
      label="step-up"
      helper="helper"
    />
  );
}

const settingsResponse = (rows: Record<string, string>) => ({
  data: Object.entries(rows).map(([settingKey, settingValue]) => ({
    settingKey,
    settingValue,
  })),
});

/** Lets queued queries, mutations and their re-renders settle. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });

describe("useSettingsPage with an on/off toggle on the same tab", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    page = undefined;
    getSettings.mockReset().mockResolvedValue(
      settingsResponse({
        admin_session_timeout_minutes: "30",
        max_message_length: "500",
      }),
    );
    updateSetting.mockReset().mockResolvedValue({ data: {} });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <SecurityTab />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps an unsaved edit when the toggle saves and the settings reload", async () => {
    await flush();
    expect(page?.form.getValues("adminSessionTimeoutMinutes")).toBe("30");

    // The admin edits the session timeout but has not pressed Save yet.
    act(() => {
      page?.form.setValue("adminSessionTimeoutMinutes", "45", {
        shouldDirty: true,
      });
    });

    // Meanwhile another field changed on the server; the toggle's save
    // invalidates the shared settings query, which reloads with it.
    getSettings.mockResolvedValue(
      settingsResponse({
        admin_session_timeout_minutes: "30",
        max_message_length: "800",
        [REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING]: "true",
      }),
    );
    const toggle = container.querySelector<HTMLButtonElement>(
      'button[role="switch"]',
    );
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    act(() => toggle?.click());
    await flush();

    expect(updateSetting).toHaveBeenCalledWith(
      REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING,
      "true",
    );
    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    // The edit survives the reseed; an untouched field takes the new value.
    expect(page?.form.getValues("adminSessionTimeoutMinutes")).toBe("45");
    expect(page?.form.getValues("maxMessageLength")).toBe("800");
  });
});
