// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type {
  AdminInstallmentPreviewResponse,
  AdminInstallmentRule,
  AdminInstallmentSettings,
} from "@tarodan/types";

const h = vi.hoisted(() => ({
  role: "super_admin",
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getRules: vi.fn(),
  createRule: vi.fn(),
  createVersion: vi.fn(),
  archive: vi.fn(),
  preview: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT, useLocale: () => "tr" };
});
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/finance/installments",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ user: { id: "staff-1", role: h.role } }),
}));
vi.mock("@/lib/api", () => ({
  adminApi: {
    getInstallmentSettings: h.getSettings,
    updateInstallmentSettings: h.updateSettings,
    getInstallmentRules: h.getRules,
    createInstallmentRule: h.createRule,
    createInstallmentRuleVersion: h.createVersion,
    archiveInstallmentRule: h.archive,
    previewInstallments: h.preview,
  },
}));

import {
  apiError,
  bodyText,
  button,
  click,
  dialogs,
  findButton,
  flush,
  mount,
  type,
  type Mounted,
} from "@/test-utils/dom";
import InstallmentsPage from "./page";

const L = "admin.finance.installments";

const settings = (
  over: Partial<AdminInstallmentSettings> = {},
): AdminInstallmentSettings => ({
  enabled: false,
  minAmount: 500,
  rates: {
    rateSnapshotId: "snap-1",
    fetchedAt: "2026-11-06T03:00:00.000Z",
    fresh: true,
    maxInstallmentNonBusiness: 12,
    families: ["bonus", "world"],
  },
  ...over,
});

const rule = (
  over: Partial<AdminInstallmentRule> = {},
): AdminInstallmentRule => ({
  id: "rule-1",
  lineageId: "rule-1",
  version: 1,
  name: "Premium free 2-3",
  segment: "premium",
  minCount: 2,
  maxCount: 3,
  allowed: true,
  platformSharePct: 100,
  priority: 0,
  validFrom: "2026-11-01T00:00:00.000Z",
  validUntil: null,
  createdBy: "admin-1",
  createdAt: "2026-11-01T00:00:00.000Z",
  archivedAt: null,
  archivedBy: null,
  status: "active",
  ...over,
});

const previewResponse = (
  over: Partial<AdminInstallmentPreviewResponse> = {},
): AdminInstallmentPreviewResponse => ({
  segment: "free",
  family: "bonus",
  baseAmount: 1000,
  rateSnapshotId: "snap-1",
  fetchedAt: "2026-11-06T03:00:00.000Z",
  rows: [
    {
      count: 3,
      offered: true,
      totalAmount: 1066.38,
      feeAmount: 66.38,
      monthlyAmount: 355.46,
      platformCostAmount: 0,
      platformSharePct: 0,
      ruleId: null,
    },
  ],
  ...over,
});

let page: Mounted;

async function open() {
  page = mount(<InstallmentsPage />);
  await flush();
}

/** Lets the preview's 300 ms debounce elapse, then the query settle. */
const debounce = async () => {
  await act(() => new Promise((resolve) => setTimeout(resolve, 350)));
  await flush();
};

const input = (name: string, scope: ParentNode = document.body) => {
  const el = scope.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`no input ${name}`);
  return el;
};
const killSwitch = () =>
  document.body.querySelector<HTMLButtonElement>('[role="switch"]')!;
const lastDialog = () => dialogs().at(-1)!;

/** Opens the row menu of the only rule row and picks an item. */
async function rowAction(label: string) {
  const trigger = document.body.querySelector<HTMLButtonElement>(
    'button[aria-label="common.actions"]',
  );
  if (!trigger) throw new Error("no row menu");
  await act(async () => {
    trigger.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
  });
  await flush();
  const item = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).find((el) => el.textContent?.trim() === label);
  if (!item) throw new Error(`no menu item ${label}`);
  await click(item);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.role = "super_admin";
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  h.getSettings.mockResolvedValue({ data: settings() });
  h.updateSettings.mockImplementation(async (patch) => ({
    data: settings(patch),
  }));
  h.getRules.mockResolvedValue({ data: [rule()] });
  h.preview.mockResolvedValue({ data: previewResponse() });
});

afterEach(() => {
  page?.unmount();
  vi.unstubAllGlobals();
});

describe("page states", () => {
  it("shows the forbidden page when the API refuses the role", async () => {
    h.getSettings.mockRejectedValue(apiError(403, "server.auth.forbidden"));
    await open();
    expect(bodyText()).toContain("admin.shared.forbidden.title");
    expect(bodyText()).not.toContain(`${L}.title`);
  });

  it("shows a retryable error when the settings do not load", async () => {
    h.getSettings.mockRejectedValue(apiError(500));
    await open();
    expect(bodyText()).toContain(`${L}.error.title`);
    h.getSettings.mockResolvedValue({ data: settings() });
    await click(button("admin.shared.suspense.retry"));
    expect(bodyText()).toContain(`${L}.general.title`);
  });

  it("says when no rate snapshot exists and prices nothing", async () => {
    h.getSettings.mockResolvedValue({
      data: settings({
        rates: {
          rateSnapshotId: null,
          fetchedAt: null,
          fresh: false,
          maxInstallmentNonBusiness: null,
          families: [],
        },
      }),
    });
    await open();
    await debounce();
    expect(bodyText()).toContain(`${L}.rates.none.title`);
    expect(bodyText()).toContain(`${L}.preview.unavailable`);
    expect(h.preview).not.toHaveBeenCalled();
  });

  it("shows the empty rules state", async () => {
    h.getRules.mockResolvedValue({ data: [] });
    await open();
    expect(bodyText()).toContain(`${L}.rules.empty`);
  });

  it("lists a rule with its segment, counts, effect and status", async () => {
    await open();
    const text = bodyText();
    expect(text).toContain("Premium free 2-3");
    expect(text).toContain("status.membershipTier.premium");
    expect(text).toContain(`${L}.rules.countRange|{"min":2,"max":3}`);
    expect(text).toContain(`${L}.rules.effectShare|{"share":"%100"}`);
    expect(text).toContain(`${L}.rules.status.active`);
  });
});

describe("permission gating", () => {
  it("leaves an admin read-only: no switch, amount, rule or archive writes", async () => {
    h.role = "admin";
    await open();
    expect(bodyText()).toContain(`${L}.readOnly`);
    expect(killSwitch().disabled).toBe(true);
    expect(input("minAmount").disabled).toBe(true);
    expect(findButton(`${L}.general.minAmountSave`)).toBeUndefined();
    expect(findButton(`${L}.rules.new`)).toBeUndefined();
    expect(
      document.body.querySelector('button[aria-label="common.actions"]'),
    ).toBeNull();
    // Reading is still allowed: the preview prices for an admin.
    await debounce();
    expect(h.preview).toHaveBeenCalled();
  });

  it("gives a super admin the writes", async () => {
    await open();
    expect(bodyText()).not.toContain(`${L}.readOnly`);
    expect(killSwitch().disabled).toBe(false);
    expect(input("minAmount").disabled).toBe(false);
    expect(findButton(`${L}.rules.new`)).toBeDefined();
  });
});

describe("kill switch", () => {
  it("asks with the flags-last rule before turning installments on", async () => {
    await open();
    await click(killSwitch());
    expect(bodyText()).toContain(`${L}.general.enableConfirm.description`);
    expect(h.updateSettings).not.toHaveBeenCalled();

    await click(button(`${L}.general.enableConfirm.confirm`, lastDialog()));
    expect(h.updateSettings).toHaveBeenCalledWith({ enabled: true });
    expect(h.toast.success).toHaveBeenCalledWith(
      `${L}.general.enabledSaved`,
      expect.anything(),
    );
  });

  it("changes nothing when the confirmation is cancelled", async () => {
    await open();
    await click(killSwitch());
    await click(button("common.cancel", lastDialog()));
    expect(h.updateSettings).not.toHaveBeenCalled();
  });

  it("warns that stale rates keep a single payment when turning on", async () => {
    h.getSettings.mockResolvedValue({
      data: settings({ rates: { ...settings().rates, fresh: false } }),
    });
    await open();
    await click(killSwitch());
    expect(bodyText()).toContain(`${L}.general.enableConfirm.staleRates`);
  });

  it("asks before turning installments off", async () => {
    h.getSettings.mockResolvedValue({ data: settings({ enabled: true }) });
    await open();
    await click(killSwitch());
    expect(bodyText()).toContain(`${L}.general.disableConfirm.description`);
    await click(button(`${L}.general.disableConfirm.confirm`, lastDialog()));
    expect(h.updateSettings).toHaveBeenCalledWith({ enabled: false });
  });
});

describe("minimum amount", () => {
  it("saves the typed TL amount", async () => {
    await open();
    await type(input("minAmount"), "750,50");
    await click(button(`${L}.general.minAmountSave`));
    expect(h.updateSettings).toHaveBeenCalledWith({ minAmount: 750.5 });
  });

  it("refuses grouped text before any request", async () => {
    await open();
    await type(input("minAmount"), "1.000,00");
    await click(button(`${L}.general.minAmountSave`));
    expect(h.updateSettings).not.toHaveBeenCalled();
    expect(bodyText()).toContain("validation.amountFormatRefused");
  });

  it("shows the API's refusal on the field, not as a toast", async () => {
    h.updateSettings.mockRejectedValue(
      apiError(400, "server.admin.installments.minAmount.outOfRange"),
    );
    await open();
    await type(input("minAmount"), "600");
    await click(button(`${L}.general.minAmountSave`));
    expect(bodyText()).toContain(
      "server:server.admin.installments.minAmount.outOfRange",
    );
    expect(h.toast.error).not.toHaveBeenCalled();
  });
});

describe("rule form", () => {
  it("validates with the shared validator before any request", async () => {
    await open();
    await click(button(`${L}.rules.new`));
    const modal = lastDialog();
    await type(input("platformSharePct", modal), "150");
    await click(button(`${L}.form.submitCreate`, lastDialog()));
    expect(h.createRule).not.toHaveBeenCalled();
    const text = lastDialog().textContent ?? "";
    expect(text).toContain("server.admin.installments.rule.nameRequired");
    expect(text).toContain("server.admin.installments.rule.shareRange");
  });

  it("previews the draft rule before saving and creates it", async () => {
    h.createRule.mockResolvedValue({ data: { rule: rule(), overlaps: [] } });
    await open();
    await click(button(`${L}.rules.new`));
    await type(input("name", lastDialog()), "Everyone half");
    await type(input("platformSharePct", lastDialog()), "50");
    await debounce();
    expect(h.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        segment: "free",
        amount: 1000,
        family: "bonus",
        draftSegment: "all",
        draftMinCount: 2,
        draftMaxCount: 3,
        draftAllowed: true,
        draftPlatformSharePct: 50,
        draftPriority: 0,
      }),
    );
    expect(lastDialog().textContent).toContain(`${L}.preview.columns.total`);

    await click(button(`${L}.form.submitCreate`, lastDialog()));
    expect(h.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Everyone half",
        segment: "all",
        platformSharePct: 50,
        validUntil: null,
      }),
    );
  });

  it("stops the draft preview while a priced field is invalid", async () => {
    await open();
    await click(button(`${L}.rules.new`));
    await debounce();
    const calls = h.preview.mock.calls.length;
    await type(input("platformSharePct", lastDialog()), "abc");
    await debounce();
    expect(lastDialog().textContent).toContain(`${L}.preview.draftNeedsFix`);
    expect(h.preview.mock.calls.length).toBe(calls);
  });

  it("warns before saving when the rule overlaps a current one", async () => {
    await open();
    await click(button(`${L}.rules.new`));
    // The new rule is for everyone, 2-3, priority 0: it meets the premium rule.
    expect(lastDialog().textContent).toContain(`${L}.rules.overlap.title`);
  });

  it("puts an API field refusal on its field", async () => {
    h.createRule.mockRejectedValue(
      apiError(400, "server.admin.installments.rule.countRange"),
    );
    await open();
    await click(button(`${L}.rules.new`));
    await type(input("name", lastDialog()), "Everyone");
    await click(button(`${L}.form.submitCreate`, lastDialog()));
    expect(lastDialog().textContent).toContain(
      "server:server.admin.installments.rule.countRange",
    );
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("shows the server's overlap warning after a save", async () => {
    h.createRule.mockResolvedValue({
      data: {
        rule: rule({ id: "rule-9", lineageId: "rule-9" }),
        overlaps: [
          { id: "rule-1", lineageId: "rule-1", version: 1, name: "Premium" },
        ],
      },
    });
    await open();
    await click(button(`${L}.rules.new`));
    await type(input("name", lastDialog()), "Everyone");
    await click(button(`${L}.form.submitCreate`, lastDialog()));
    expect(dialogs()).toHaveLength(0);
    expect(bodyText()).toContain(
      `${L}.rules.overlap.description|{"rules":"${L}.rules.nameVersion|{\\"name\\":\\"Premium\\",\\"version\\":1}"}`,
    );
  });
});

describe("new version and archive", () => {
  it("prices the draft without the version it replaces", async () => {
    await open();
    await rowAction(`${L}.rules.actions.newVersion`);
    await debounce();
    expect(h.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        segment: "premium",
        draftSegment: "premium",
        draftPlatformSharePct: 100,
        replacesRuleId: "rule-1",
      }),
    );
  });

  it("says a stale version (409) in the form, blocks the submit and reloads the list", async () => {
    h.createVersion.mockRejectedValue(
      apiError(409, "server.admin.installments.rule.notCurrent"),
    );
    await open();
    expect(h.getRules).toHaveBeenCalledTimes(1);
    await rowAction(`${L}.rules.actions.newVersion`);
    await type(input("platformSharePct", lastDialog()), "50");
    await click(button(`${L}.form.submitVersion`, lastDialog()));
    expect(h.createVersion).toHaveBeenCalledWith(
      "rule-1",
      expect.objectContaining({ platformSharePct: 50 }),
    );
    expect(lastDialog().textContent).toContain(
      "server:server.admin.installments.rule.notCurrent",
    );
    expect(button(`${L}.form.submitVersion`, lastDialog()).disabled).toBe(true);
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.getRules).toHaveBeenCalledTimes(2);
  });

  it("archives after a confirmation", async () => {
    h.archive.mockResolvedValue({
      data: {
        rule: rule({ archivedAt: "2026-11-06T10:00:00.000Z" }),
        overlaps: [],
      },
    });
    await open();
    await rowAction(`${L}.rules.actions.archive`);
    expect(bodyText()).toContain(`${L}.rules.archiveConfirm.title`);
    await click(button(`${L}.rules.actions.archive`, lastDialog()));
    expect(h.archive).toHaveBeenCalledWith("rule-1");
  });

  it("closes the archive dialog on a stale version and reloads the list", async () => {
    h.archive.mockRejectedValue(
      apiError(409, "server.admin.installments.rule.notCurrent"),
    );
    await open();
    await rowAction(`${L}.rules.actions.archive`);
    await click(button(`${L}.rules.actions.archive`, lastDialog()));
    expect(dialogs()).toHaveLength(0);
    expect(h.toast.error).toHaveBeenCalledWith(
      "server:server.admin.installments.rule.notCurrent",
      expect.anything(),
    );
    expect(h.getRules).toHaveBeenCalledTimes(2);
  });
});

describe("page preview", () => {
  it("prices the live rules for the default inputs", async () => {
    await open();
    await debounce();
    expect(h.preview).toHaveBeenCalledWith({
      segment: "free",
      amount: 1000,
      family: "bonus",
    });
    expect(bodyText()).toContain(`${L}.preview.defaultRule`);
    expect(bodyText()).toContain("₺1.066,38");
  });

  it("explains a family PayTR gives no installments", async () => {
    h.preview.mockResolvedValue({
      data: previewResponse({ reason: "card_not_eligible", rows: [] }),
    });
    await open();
    await debounce();
    expect(bodyText()).toContain(`${L}.preview.cardNotEligible`);
  });
});
