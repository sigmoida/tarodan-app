// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_DOCUMENTS,
  type BoostOptionsResponse,
  type InitiateBoostResponse,
} from "@tarodan/types";
import { formatTL } from "@/lib/format";
import { PLATFORM_ENTITY } from "@/lib/legal/platform-entity";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  options: vi.fn(),
  initiate: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

// The key comes back instead of the text (with its values), and rich tags
// render their element around the tag name, so links stay inspectable.
vi.mock("next-intl", () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key}|${JSON.stringify(values)}` : key;
  t.rich = (key: string, values: Record<string, unknown> = {}) => {
    const entries = Object.entries(values);
    const plain = entries.filter(([, v]) => typeof v !== "function");
    return createElement(
      Fragment,
      null,
      plain.length ? t(key, Object.fromEntries(plain)) : key,
      ...entries
        .filter(([, v]) => typeof v === "function")
        .map(([name, render]) => (render as (c: ReactNode) => ReactNode)(name)),
    );
  };
  return { useTranslations: () => t };
});
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/api", () => ({
  boostApi: { options: h.options, initiate: h.initiate },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import BoostModal, { type BoostListing } from "./BoostModal";

const OPTIONS: BoostOptionsResponse = {
  enabled: true,
  productPrice: 1000,
  packages: [
    {
      id: "pkg-eco",
      name: "Ekonomik",
      slug: "ekonomik",
      showcaseOnHome: false,
      options: [
        {
          durationDays: 3,
          price: 39,
          listPrice: 39,
          campaign: false,
          label: "3",
        },
        {
          durationDays: 7,
          price: 59,
          listPrice: 79,
          campaign: true,
          label: "7",
        },
      ],
    },
    {
      id: "pkg-vitrin",
      name: "Vitrin",
      slug: "vitrin",
      showcaseOnHome: true,
      options: [
        {
          durationDays: 7,
          price: 149,
          listPrice: 149,
          campaign: false,
          label: "7",
        },
      ],
    },
  ],
};

const STARTED: InitiateBoostResponse = {
  boostId: "boost-1",
  productId: "listing-1",
  durationDays: 7,
  price: 59,
  paymentId: "pay-1",
  provider: "paytr",
  expiresIn: 900,
  useBypass: false,
};

const LISTING: BoostListing = { id: "listing-1", title: "1:18 Ferrari F40" };

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const onClose = vi.fn();

function render(props: { canRemind?: boolean; listing?: BoostListing } = {}) {
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <BoostModal
          listing={props.listing ?? LISTING}
          canRemind={props.canRemind ?? false}
          onClose={onClose}
        />
      </QueryClientProvider>,
    ),
  );
}

/** Lets queries, mutations and their callbacks settle. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
const dialog = () =>
  document.body.querySelector('[role="dialog"]') as HTMLElement;
const text = () => dialog()?.textContent ?? "";

function button(label: string): HTMLButtonElement {
  const found = Array.from(document.body.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(label),
  );
  if (!found) throw new Error(`no button "${label}"`);
  return found as HTMLButtonElement;
}
const payButton = () => button("profile.boost.featureAndPay");
const checkboxes = () =>
  Array.from(
    dialog().querySelectorAll('input[type="checkbox"]'),
  ) as HTMLInputElement[];
const reminderSwitch = () =>
  dialog().querySelector('[role="switch"]') as HTMLButtonElement;
const click = (el: HTMLElement) => act(() => el.click());

async function acceptBoth() {
  const [contract, waiver] = checkboxes();
  click(contract);
  click(waiver);
}

/** The duration row (`label`) for a package's option. */
function durationRow(packageName: string, days: number): HTMLElement {
  const block = Array.from(dialog().querySelectorAll("div.rounded-lg")).find(
    (b) => b.textContent?.startsWith(packageName),
  ) as HTMLElement;
  const row = Array.from(block.querySelectorAll("label")).find((l) =>
    l.textContent?.includes(`"days":${days}`),
  );
  if (!row) throw new Error(`no ${days}-day row in ${packageName}`);
  return row as HTMLElement;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  h.options.mockResolvedValue({ data: OPTIONS });
  h.initiate.mockResolvedValue({ data: STARTED });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("BoostModal consent gating", () => {
  it("keeps pay disabled until both consents are ticked", async () => {
    render();
    await flush();

    // A duration is pre-selected (first package, 7 days), the consents are not.
    expect(checkboxes().map((c) => c.checked)).toEqual([false, false]);
    expect(payButton().disabled).toBe(true);
    expect(text()).toContain("profile.boost.consent.required");

    click(checkboxes()[0]);
    expect(payButton().disabled).toBe(true);

    click(checkboxes()[1]);
    expect(payButton().disabled).toBe(false);
    expect(text()).not.toContain("profile.boost.consent.required");

    click(checkboxes()[0]);
    expect(payButton().disabled).toBe(true);
    click(payButton());
    expect(h.initiate).not.toHaveBeenCalled();
  });

  it("links both contract names to the platform service sales page in a new tab", async () => {
    render();
    await flush();

    const links = Array.from(
      checkboxes()[0].closest("label")!.querySelectorAll("a"),
    );
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe(
        CONSENT_DOCUMENTS.platform_service_sales.path,
      );
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("starts unticked on every mount, never remembered", async () => {
    render();
    await flush();
    await acceptBoth();
    act(() => root.unmount());

    root = createRoot(container);
    render();
    await flush();
    expect(checkboxes().map((c) => c.checked)).toEqual([false, false]);
    expect(payButton().disabled).toBe(true);
  });
});

describe("BoostModal request", () => {
  it("sends the package, the duration and both consents, then opens the pay page", async () => {
    render();
    await flush();
    await acceptBoth();
    click(payButton());
    await flush();

    expect(h.initiate).toHaveBeenCalledTimes(1);
    const [productId, body] = h.initiate.mock.calls[0];
    expect(productId).toBe("listing-1");
    expect(body).toEqual({
      packageId: "pkg-eco",
      durationDays: 7,
      preInformationAccepted: true,
      withdrawalWaiverAccepted: true,
    });
    // No reminder field at all for a seller without a paid membership.
    expect(body).not.toHaveProperty("autoRenew");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(h.push).toHaveBeenCalledWith("/payment/pay-1?type=boost");
  });

  it("sends the chosen package and duration", async () => {
    render();
    await flush();
    click(durationRow("Vitrin", 7).querySelector("input")!);
    await acceptBoth();
    click(payButton());
    await flush();

    expect(h.initiate.mock.calls[0][1]).toMatchObject({
      packageId: "pkg-vitrin",
      durationDays: 7,
    });
  });

  it("sends the reminder choice for a premium seller", async () => {
    render({ canRemind: true });
    await flush();
    expect(reminderSwitch().disabled).toBe(false);
    await acceptBoth();
    click(payButton());
    await flush();
    expect(h.initiate.mock.calls[0][1]).toMatchObject({ autoRenew: false });

    h.initiate.mockClear();
    click(reminderSwitch());
    expect(reminderSwitch().getAttribute("aria-checked")).toBe("true");
    click(payButton());
    await flush();
    expect(h.initiate.mock.calls[0][1]).toMatchObject({ autoRenew: true });
  });

  it("shows the reminder off and disabled for other sellers, with the premium hint and upgrade link", async () => {
    render({ canRemind: false });
    await flush();

    expect(reminderSwitch().disabled).toBe(true);
    expect(reminderSwitch().getAttribute("aria-checked")).toBe("false");
    expect(reminderSwitch().getAttribute("aria-label")).toBe(
      "profile.boost.autoRenewLabel",
    );
    expect(text()).toContain("profile.boosts.reminder.premiumOnly");
    const upgrade = Array.from(dialog().querySelectorAll("a")).find(
      (a) => a.textContent === "profile.boost.reminderUpgrade",
    );
    expect(upgrade?.getAttribute("href")).toBe("/membership");

    click(reminderSwitch());
    expect(reminderSwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("keeps the dialog open with the consents ticked when the server rejects the consents", async () => {
    h.initiate.mockRejectedValue({
      response: {
        status: 400,
        data: {
          message: "server:consent",
          i18nKey: "server.product.boostConsentRequired",
        },
      },
    });
    render();
    await flush();
    await acceptBoth();
    click(payButton());
    await flush();

    expect(h.toast.error).toHaveBeenCalledWith("server:consent");
    expect(onClose).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
    expect(checkboxes().map((c) => c.checked)).toEqual([true, true]);
    const helper = Array.from(dialog().querySelectorAll("p")).find(
      (p) => p.textContent === "profile.boost.consent.required",
    );
    expect(helper?.className).toContain("text-danger-600");
  });

  it("toasts the generic failure when the server gives no message", async () => {
    h.initiate.mockRejectedValue(new Error("network"));
    render();
    await flush();
    await acceptBoth();
    click(payButton());
    await flush();

    expect(h.toast.error).toHaveBeenCalledWith("profile.boost.initiateFailed");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("BoostModal pre-contract information", () => {
  it("names the provider, the service and the price of the current selection", async () => {
    render();
    await flush();

    expect(text()).toContain("profile.boost.preInfo.title");
    expect(text()).toContain(
      `profile.boost.preInfo.provider|${JSON.stringify({ company: PLATFORM_ENTITY.legalName })}`,
    );
    expect(text()).toContain(
      `profile.boost.preInfo.service|${JSON.stringify({ listing: LISTING.title, package: "Ekonomik", days: 7 })}`,
    );
    expect(text()).toContain(
      `profile.boost.preInfo.price|${JSON.stringify({ price: formatTL(59) })}`,
    );
    expect(text()).toContain("profile.boost.preInfo.start");
    expect(text()).toContain("profile.boost.preInfo.noCancel");

    click(durationRow("Ekonomik", 3).querySelector("input")!);
    expect(text()).toContain(
      `profile.boost.preInfo.service|${JSON.stringify({ listing: LISTING.title, package: "Ekonomik", days: 3 })}`,
    );
    expect(text()).toContain(
      `profile.boost.preInfo.price|${JSON.stringify({ price: formatTL(39) })}`,
    );
  });

  it("shows the extend summary and label for a listing that is boosted", async () => {
    const inThreeDays = new Date(Date.now() + 2.5 * 86_400_000).toISOString();
    render({ listing: { ...LISTING, boostedUntil: inThreeDays } });
    await flush();

    expect(text()).toContain("page.listings.boostmodal.aktifOneCikarma");
    expect(text()).toContain(
      `profile.boost.extendSummary|${JSON.stringify({ remaining: 3, selected: 7, total: 10 })}`,
    );
    expect(button("profile.boost.extendAndPay")).toBeTruthy();
  });
});

describe("BoostModal states", () => {
  it("offers nothing to buy while boost sales are off", async () => {
    h.options.mockResolvedValue({ data: { ...OPTIONS, enabled: false } });
    render();
    await flush();

    expect(text()).toContain("profile.boost.unavailable");
    expect(checkboxes()).toHaveLength(0);
    expect(text()).not.toContain("profile.boost.preInfo.title");
    expect(payButton().disabled).toBe(true);
  });

  it("offers nothing to buy when no package matches the price", async () => {
    h.options.mockResolvedValue({ data: { ...OPTIONS, packages: [] } });
    render();
    await flush();

    expect(text()).toContain("profile.boost.noPackages");
    expect(checkboxes()).toHaveLength(0);
    expect(payButton().disabled).toBe(true);
  });

  it("shows the load error inline with a retry instead of a toast", async () => {
    h.options.mockRejectedValueOnce(new Error("down"));
    render();
    await flush();

    expect(text()).toContain("profile.boost.pricingLoadError");
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(payButton().disabled).toBe(true);

    click(button("common.tryAgain"));
    await flush();
    expect(h.options).toHaveBeenCalledTimes(2);
    expect(text()).toContain("profile.boost.preInfo.title");
  });
});
