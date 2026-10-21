// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIGN_IN_METHOD_EVENTS,
  SIGN_IN_METHOD_EVENT_TYPES,
  type AdminSignInMethodEvent,
  type AdminSignInMethodEventList,
  type SignInMethods,
} from "@tarodan/types";
import { PermissionsProvider } from "@/context/PermissionsContext";
import type { Permissions } from "@/lib/server/permissions";

const getUserSignInMethods = vi.fn();
const getUserSignInMethodEvents = vi.fn();

vi.mock("@/lib/api", () => ({
  adminApi: {
    getUserSignInMethods: (...args: unknown[]) => getUserSignInMethods(...args),
    getUserSignInMethodEvents: (...args: unknown[]) =>
      getUserSignInMethodEvents(...args),
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/accounts/users/u1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
// The Radix select of the "Rows per page" control cannot be driven in jsdom;
// the stand-in keeps its `onChange(e)` contract and lets a test pick a size.
const pageSizeSelect = vi.hoisted(() => ({
  choose: undefined as ((value: string) => void) | undefined,
}));
vi.mock("@tarodan/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tarodan/ui")>()),
  Select: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
  }) => {
    pageSizeSelect.choose = (next) => onChange?.({ target: { value: next } });
    return <span data-testid="page-size">{value}</span>;
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { captureException: vi.fn() },
}));

import { SignInMethodsSection } from "./SignInMethodsSection";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class NoopResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const USER_ID = "u1";
/** A documentation address (RFC 5737); it must never reach the screen. */
const IP = "203.0.113.7";

const methods = (
  over: Partial<SignInMethods> = {},
): { data: SignInMethods } => ({
  data: {
    hasPassword: true,
    providers: [
      {
        provider: "google",
        email: "linked@example.com",
        linkedAt: "2026-10-01T09:30:00.000Z",
      },
    ],
    ...over,
  },
});

/**
 * One row per event type. Every row also carries an IP and a user agent, as a
 * careless API change could add them: the section must not show them.
 */
function eventRows(): AdminSignInMethodEvent[] {
  return SIGN_IN_METHOD_EVENT_TYPES.map((eventType, i) => {
    const isReauth =
      eventType === SIGN_IN_METHOD_EVENTS.reauthFailed ||
      eventType === SIGN_IN_METHOD_EVENTS.reauthLocked;
    const isPasswordSet = eventType === SIGN_IN_METHOD_EVENTS.passwordSet;
    return {
      id: `e${i}`,
      eventType,
      occurredAt: `2026-10-${String(10 + i).padStart(2, "0")}T08:00:00.000Z`,
      provider: isReauth || isPasswordSet ? null : "apple",
      source: isReauth || isPasswordSet ? null : "login",
      method: isReauth ? "password" : null,
      flow: null,
      ipAddress: IP,
      userAgent: "Mozilla/5.0 test",
    } as AdminSignInMethodEvent;
  });
}

const eventsPage = (
  data: AdminSignInMethodEvent[],
  meta: Partial<AdminSignInMethodEventList["meta"]> = {},
): { data: AdminSignInMethodEventList } => ({
  data: {
    data,
    meta: {
      total: data.length,
      page: 1,
      limit: 20,
      totalPages: 1,
      ...meta,
    },
  },
});

/** Lets the queries, the hydration effect and their re-renders settle. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  });

let container: HTMLDivElement;
let root: Root;

async function render(permissions: Permissions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <PermissionsProvider permissions={permissions}>
          <SignInMethodsSection userId={USER_ID} />
        </PermissionsProvider>
      </QueryClientProvider>,
    );
  });
  await flush();
}

const withUsers: Permissions = { isSuperAdmin: false, keys: ["users"] };
const text = () => container.textContent ?? "";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  // The error boundaries log the caught fetch errors through React.
  vi.spyOn(console, "error").mockImplementation(() => {});
  getUserSignInMethods.mockReset().mockResolvedValue(methods());
  getUserSignInMethodEvents.mockReset().mockResolvedValue(eventsPage([]));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SignInMethodsSection permission", () => {
  it("renders nothing and fetches nothing without the users permission", async () => {
    await render({ isSuperAdmin: false, keys: ["seller_performance"] });

    expect(container.innerHTML).toBe("");
    expect(getUserSignInMethods).not.toHaveBeenCalled();
    expect(getUserSignInMethodEvents).not.toHaveBeenCalled();
  });

  it("renders for the users permission and for a super admin", async () => {
    await render(withUsers);
    expect(text()).toContain("admin.users.signInMethods.title");

    act(() => root.unmount());
    root = createRoot(container);
    await render({ isSuperAdmin: true, keys: [] });
    expect(text()).toContain("admin.users.signInMethods.title");
  });
});

describe("SignInMethodsSection methods", () => {
  it("shows the password state and each linked provider with its e-mail", async () => {
    await render(withUsers);

    expect(getUserSignInMethods).toHaveBeenCalledWith(USER_ID);
    expect(text()).toContain("admin.users.signInMethods.passwordSet");
    expect(text()).toContain("Google");
    expect(text()).toContain("linked@example.com");
    expect(text()).not.toContain("admin.users.signInMethods.noProviders");
  });

  it("shows no password and no connected accounts", async () => {
    getUserSignInMethods.mockResolvedValue(
      methods({ hasPassword: false, providers: [] }),
    );
    await render(withUsers);

    expect(text()).toContain("admin.users.signInMethods.passwordNotSet");
    expect(text()).toContain("admin.users.signInMethods.noProviders");
  });

  it("shows its own load error and still shows the history", async () => {
    getUserSignInMethods.mockRejectedValue(new Error("boom"));
    getUserSignInMethodEvents.mockResolvedValue(eventsPage(eventRows()));
    await render(withUsers);

    expect(text()).toContain("admin.users.signInMethods.loadError");
    expect(text()).not.toContain("admin.users.signInMethods.historyLoadError");
    expect(text()).toContain("admin.system.logs.events.socialLinked");
  });
});

describe("SignInMethodsSection history", () => {
  it("labels every event type and asks for the first page", async () => {
    getUserSignInMethodEvents.mockResolvedValue(eventsPage(eventRows()));
    await render(withUsers);

    expect(getUserSignInMethodEvents).toHaveBeenCalledWith(USER_ID, {
      page: 1,
      limit: 20,
    });
    for (const key of [
      "admin.system.logs.events.socialLinked",
      "admin.system.logs.events.socialLinkedAuto",
      "admin.system.logs.events.socialLinkReset",
      "admin.system.logs.events.socialUnlinked",
      "admin.system.logs.events.passwordSet",
      "admin.system.logs.events.reauthFailed",
      "admin.system.logs.events.reauthLocked",
    ]) {
      expect(text()).toContain(key);
    }
    expect(text()).toContain("admin.users.signInMethods.sourceLogin");
  });

  it("shows the proof for a step-up and a dash when an event names no provider", async () => {
    getUserSignInMethodEvents.mockResolvedValue(
      eventsPage(
        eventRows().filter(
          (e) =>
            e.eventType === SIGN_IN_METHOD_EVENTS.reauthFailed ||
            e.eventType === SIGN_IN_METHOD_EVENTS.passwordSet,
        ),
      ),
    );
    getUserSignInMethods.mockResolvedValue(
      methods({ hasPassword: false, providers: [] }),
    );
    await render(withUsers);

    const rows = [...container.querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll("td")].map((cell) => cell.textContent),
    );
    const reauth = rows.find((cells) =>
      cells.includes("admin.system.logs.events.reauthFailed"),
    );
    const passwordSet = rows.find((cells) =>
      cells.includes("admin.system.logs.events.passwordSet"),
    );
    // Event, provider (or proof), source, date.
    expect(reauth?.slice(0, 3)).toEqual([
      "admin.system.logs.events.reauthFailed",
      "admin.users.signInMethods.password",
      "—",
    ]);
    expect(passwordSet?.slice(0, 3)).toEqual([
      "admin.system.logs.events.passwordSet",
      "—",
      "—",
    ]);
  });

  it("never shows an IP address or a user agent", async () => {
    getUserSignInMethodEvents.mockResolvedValue(eventsPage(eventRows()));
    await render(withUsers);

    expect(text()).toContain("admin.system.logs.events.reauthLocked");
    expect(container.innerHTML).not.toContain(IP);
    expect(container.innerHTML).not.toContain("Mozilla");
  });

  it("shows the empty state", async () => {
    await render(withUsers);

    expect(text()).toContain("admin.users.signInMethods.historyEmpty");
  });

  it("retries only the history from its own Retry", async () => {
    getUserSignInMethodEvents
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(eventsPage(eventRows()));
    await render(withUsers);
    expect(text()).toContain("admin.users.signInMethods.historyLoadError");

    const retry = [...container.querySelectorAll("button")].filter(
      (button) => button.textContent === "admin.shared.suspense.retry",
    );
    expect(retry).toHaveLength(1);
    await act(async () => retry[0].click());
    await flush();

    expect(text()).not.toContain("admin.users.signInMethods.historyLoadError");
    expect(text()).toContain("admin.system.logs.events.socialLinked");
    // The methods kept their data: the history's Retry did not refetch them.
    expect(getUserSignInMethods).toHaveBeenCalledTimes(1);
  });

  it("shows its own load error and still shows the methods", async () => {
    getUserSignInMethodEvents.mockRejectedValue(new Error("boom"));
    await render(withUsers);

    expect(text()).toContain("admin.users.signInMethods.historyLoadError");
    expect(text()).not.toContain("admin.users.signInMethods.loadError");
    expect(text()).toContain("admin.users.signInMethods.passwordSet");
  });

  it("pages through the history", async () => {
    getUserSignInMethodEvents.mockImplementation(
      async (_id: string, params: { page: number; limit: number }) =>
        eventsPage(eventRows().slice(0, 2), {
          total: 45,
          page: params.page,
          totalPages: 3,
        }),
    );
    await render(withUsers);

    const pageTwo = [
      ...container.querySelectorAll<HTMLButtonElement>("nav button"),
    ].find((button) => button.textContent === "2");
    expect(pageTwo).toBeDefined();
    await act(async () => pageTwo!.click());
    await flush();

    expect(getUserSignInMethodEvents).toHaveBeenLastCalledWith(USER_ID, {
      page: 2,
      limit: 20,
    });
  });

  it("asks for the chosen page size, from the first page", async () => {
    getUserSignInMethodEvents.mockImplementation(
      async (_id: string, params: { page: number; limit: number }) =>
        eventsPage(eventRows().slice(0, 2), {
          total: 600,
          page: params.page,
          limit: params.limit,
          totalPages: Math.ceil(600 / params.limit),
        }),
    );
    await render(withUsers);

    const choose = async (size: string) => {
      expect(pageSizeSelect.choose).toBeDefined();
      await act(async () => pageSizeSelect.choose!(size));
      await flush();
    };

    await choose("50");
    expect(getUserSignInMethodEvents).toHaveBeenLastCalledWith(USER_ID, {
      page: 1,
      limit: 50,
    });
    await choose("500");
    expect(getUserSignInMethodEvents).toHaveBeenLastCalledWith(USER_ID, {
      page: 1,
      limit: 500,
    });
  });
});
