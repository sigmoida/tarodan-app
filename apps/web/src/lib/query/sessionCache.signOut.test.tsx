// @vitest-environment jsdom

/**
 * The session listener seen from the sign-out paths that keep the `(main)`
 * shell mounted: the consent and legal identity gates, and account deletion.
 * Unlike `/logout`, these leave the page and its queries on screen, so they
 * prove the privacy property end to end: the real auth store, the one
 * browser QueryClient, and a mounted component that showed the user's data.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@tarodan/ui";
import type { LegalIdentityStatus } from "@tarodan/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  logoutAction: vi.fn(),
  deleteMe: vi.fn(),
  getProfile: vi.fn(),
  hasAuthMarker: vi.fn(() => false),
  routerPush: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: h.routerPush, replace: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  api: { delete: h.deleteMe },
  authApi: {},
  userApi: { getProfile: h.getProfile },
}));
vi.mock("@/lib/authMarker", () => ({
  hasAuthMarker: h.hasAuthMarker,
  clearAuthMarker: vi.fn(),
}));
vi.mock("@/lib/server/auth-actions", () => ({
  loginAction: vi.fn(),
  googleLoginAction: vi.fn(),
  appleLoginAction: vi.fn(),
  logoutAction: h.logoutAction,
}));
// One real client, like the browser singleton the store's listener resolves.
vi.mock("@/lib/query/getQueryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { getQueryClient: () => client };
});

import { getQueryClient } from "@/lib/query/getQueryClient";
import { useAuthStore } from "@/stores/authStore";
import ConsentGate from "@/components/legal/ConsentGate";
import LegalIdentityGate from "@/components/identity/LegalIdentityGate";
import { useDeleteAccount } from "@/app/[locale]/(main)/profile/_hooks/useDeleteAccount";

const ORDERS = ["orders", "list"];
const DRAFT = ["listings", "draft"];

/** A private page under the gate: it shows the signed-in user's orders. */
function Orders({ fetchOrders }: { fetchOrders: () => Promise<string[]> }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data } = useQuery({
    queryKey: ORDERS,
    queryFn: fetchOrders,
    enabled: isAuthenticated,
    staleTime: Infinity,
  });
  rendered.push(data?.join(",") ?? "none");
  return <p data-testid="orders">{data?.join(",") ?? "none"}</p>;
}

/** A form of the user that left a mutation (and its variables) behind. */
function Draft() {
  const { mutate } = useMutation({
    mutationKey: DRAFT,
    mutationFn: async (_vars: { iban: string }) => undefined,
  });
  return <Button onClick={() => mutate({ iban: "TR-u1" })}>save-draft</Button>;
}

function DeleteAccount() {
  const del = useDeleteAccount();
  return <Button onClick={() => del.mutate()}>delete-account</Button>;
}

const identityStatus: LegalIdentityStatus = {
  required: true,
  missing: ["nationalId"],
  legalFirstName: "Test",
  legalLastName: "User",
  nationalIdMasked: null,
  suggestedNationalId: null,
};
const idle = { isPending: false, mutate: vi.fn() };

let rendered: string[] = [];
let container: HTMLDivElement;
let root: Root;

const signInAs = (id: string) =>
  useAuthStore.setState({
    user: { id } as never,
    isAuthenticated: true,
    isLoading: false,
  });

function render(signOutControl: React.ReactNode) {
  act(() =>
    root.render(
      <QueryClientProvider client={getQueryClient()}>
        <Orders fetchOrders={async () => ["fetched-after-change"]} />
        <Draft />
        {signOutControl}
      </QueryClientProvider>,
    ),
  );
}

function button(label: string) {
  const found = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

async function click(label: string) {
  await act(async () => {
    button(label).click();
  });
}

/** Lets React Query's scheduled notifications and the refetch settle. */
async function until(done: () => boolean) {
  for (let i = 0; i < 50 && !done(); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

const shownOrders = () =>
  document.querySelector('[data-testid="orders"]')?.textContent;

beforeEach(() => {
  h.logoutAction.mockReset().mockResolvedValue(undefined);
  h.deleteMe.mockReset().mockResolvedValue({ data: {} });
  h.getProfile.mockReset();
  h.hasAuthMarker.mockReset().mockReturnValue(false);
  h.routerPush.mockReset();
  rendered = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  signInAs("u1");
  getQueryClient().setQueryData(ORDERS, ["u1-order"]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  getQueryClient().clear();
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
  localStorage.clear();
});

describe("signing out with the (main) page still mounted", () => {
  it.each([
    [
      "the consent gate",
      () => <ConsentGate pending={[]} accept={idle as never} />,
      "common.logout",
    ],
    [
      "the legal identity gate",
      () => (
        <LegalIdentityGate status={identityStatus} submit={idle as never} />
      ),
      "common.logout",
    ],
    ["account deletion", () => <DeleteAccount />, "delete-account"],
  ])(
    "%s leaves no data of the previous user on screen or in the cache",
    async (_path, control, label) => {
      render(control());
      expect(shownOrders()).toBe("u1-order");
      await click("save-draft");
      expect(getQueryClient().getMutationCache().getAll()).not.toHaveLength(0);

      await click(label);
      await until(() => shownOrders() === "none");

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(shownOrders()).toBe("none");
      expect(getQueryClient().getQueryData(ORDERS)).toBeUndefined();
      // The guest is not refetching the previous user's private query.
      expect(getQueryClient().isFetching()).toBe(0);
      // Nor can it read the previous user's form variables.
      expect(
        getQueryClient()
          .getMutationCache()
          .getAll()
          .filter((m) => m.options.mutationKey?.[0] === DRAFT[0]),
      ).toHaveLength(0);
    },
  );

  it("account deletion signs out before leaving for the home page", async () => {
    render(<DeleteAccount />);

    await click("delete-account");
    await until(() => h.routerPush.mock.calls.length > 0);

    expect(h.deleteMe).toHaveBeenCalledWith("/users/me");
    expect(h.logoutAction).toHaveBeenCalledTimes(1);
    expect(h.routerPush).toHaveBeenCalledWith("/");
  });
});

describe("another account replacing the user without a reload", () => {
  it("never renders the previous user's rows after the switch", async () => {
    render(null);
    expect(shownOrders()).toBe("u1-order");
    rendered = [];

    act(() => useAuthStore.getState().setUser({ id: "u2" } as never));
    await until(() => shownOrders() === "fetched-after-change");

    expect(shownOrders()).toBe("fetched-after-change");
    expect(rendered).not.toContain("u1-order");
  });
});
