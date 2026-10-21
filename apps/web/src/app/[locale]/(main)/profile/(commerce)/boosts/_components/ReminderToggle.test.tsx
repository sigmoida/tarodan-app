// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyBoostsResponse } from "@tarodan/types";
import { boostRow } from "../_lib/testRows";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The reminder switch: premium turns it on and off (optimistically, cache
 * rows follow), other members see it disabled with the way to upgrade, and a
 * rejection restores the switch and shows the API's message.
 */

const h = vi.hoisted(() => ({
  tier: "pro" as string | undefined,
  reminder: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("react-hot-toast", () => ({
  default: { error: h.toastError, success: h.toastSuccess },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({ user: h.tier ? { membershipTier: h.tier } : null }),
}));
vi.mock("@/lib/api", () => ({
  boostApi: { reminder: h.reminder },
}));

import { queryKeys, webKeys } from "@/lib/query/keys";
import ReminderToggle from "./ReminderToggle";

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const cacheKey = webKeys.list(queryKeys.boost.my.resource, ["current", 1]);

const seed = (autoRenew: boolean): MyBoostsResponse => ({
  data: [boostRow({ autoRenew })],
  meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
});
const switchEl = () =>
  container.querySelector('[role="switch"]') as HTMLButtonElement;
const flush = () => act(async () => {});

const render = (checked = false) =>
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <ReminderToggle productId="p1" checked={checked} />
      </QueryClientProvider>,
    ),
  );

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(cacheKey, seed(false));
  h.tier = "pro";
  h.reminder.mockReset();
  h.toastError.mockReset();
  h.toastSuccess.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ReminderToggle", () => {
  it("lets a premium member turn the reminder on and shows the saved toast", async () => {
    h.reminder.mockResolvedValue({ data: { enabled: true } });
    await render(false);
    expect(switchEl().disabled).toBe(false);
    expect(container.textContent).toContain("profile.boosts.reminder.hint");

    await act(async () => switchEl().click());
    expect(h.reminder).toHaveBeenCalledWith("p1", { enabled: true });
    await flush();
    expect(h.toastSuccess).toHaveBeenCalledWith(
      "profile.boosts.reminder.saved",
    );
  });

  it("turns it off for a premium member", async () => {
    h.reminder.mockResolvedValue({ data: { enabled: false } });
    await render(true);
    await act(async () => switchEl().click());
    expect(h.reminder).toHaveBeenCalledWith("p1", { enabled: false });
  });

  it("flips the cached rows at once", async () => {
    let finish: (v: unknown) => void = () => {};
    h.reminder.mockReturnValue(new Promise((r) => (finish = r)));
    await render(false);
    await act(async () => switchEl().click());
    expect(
      client.getQueryData<MyBoostsResponse>(cacheKey)?.data[0].autoRenew,
    ).toBe(true);
    await act(async () => finish({ data: { enabled: true } }));
  });

  it("disables the switch for a non-premium member and links to the membership page", async () => {
    h.tier = "free";
    await render(false);
    expect(switchEl().disabled).toBe(true);
    expect(container.textContent).toContain(
      "profile.boosts.reminder.premiumOnly",
    );
    expect(container.textContent).not.toContain("profile.boosts.reminder.hint");
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/membership");
    expect(link?.textContent).toBe("profile.boost.reminderUpgrade");
  });

  it("lets a non-premium member turn an on reminder off (off never needs premium)", async () => {
    h.tier = "free";
    h.reminder.mockResolvedValue({ data: { enabled: false } });
    await render(true);
    expect(switchEl().disabled).toBe(false);
    await act(async () => switchEl().click());
    expect(h.reminder).toHaveBeenCalledWith("p1", { enabled: false });
  });

  it("rolls back only its own listing, keeping a switch flipped meanwhile on another", async () => {
    client.setQueryData(cacheKey, {
      data: [
        boostRow({ autoRenew: false }),
        boostRow({ id: "b2", productId: "p2", autoRenew: false }),
      ],
      meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
    } satisfies MyBoostsResponse);
    let refuse: (e: unknown) => void = () => {};
    h.reminder.mockImplementation((productId: string) =>
      productId === "p1"
        ? new Promise((_, reject) => (refuse = reject))
        : new Promise(() => {}),
    );
    await act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <ReminderToggle productId="p1" checked={false} />
          <ReminderToggle productId="p2" checked={false} />
        </QueryClientProvider>,
      ),
    );
    const [first, second] = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="switch"]'),
    );
    await act(async () => first.click());
    await act(async () => second.click());
    await act(async () => refuse({ response: { data: { message: "no" } } }));
    await flush();
    const rows = client.getQueryData<MyBoostsResponse>(cacheKey)?.data;
    expect(rows?.find((r) => r.productId === "p1")?.autoRenew).toBe(false);
    expect(rows?.find((r) => r.productId === "p2")?.autoRenew).toBe(true);
  });

  it("restores the rows and toasts the API message when the server refuses", async () => {
    h.reminder.mockRejectedValue({
      response: {
        data: {
          message: "Hatırlatma Premium üyeler içindir.",
          i18nKey: "server.product.boostReminderPremiumOnly",
        },
      },
    });
    await render(false);
    await act(async () => switchEl().click());
    await flush();
    expect(h.toastError).toHaveBeenCalledWith(
      "Hatırlatma Premium üyeler içindir.",
    );
    expect(
      client.getQueryData<MyBoostsResponse>(cacheKey)?.data[0].autoRenew,
    ).toBe(false);
  });
});
