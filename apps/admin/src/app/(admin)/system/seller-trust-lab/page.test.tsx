// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { focusManager, onlineManager } from "@tanstack/react-query";
import type { SellerTrustLabSeller } from "@tarodan/types";

const h = vi.hoisted(() => ({
  params: vi.fn(),
  scenarios: vi.fn(),
  scenario: vi.fn(),
  seller: vi.fn(),
  population: vi.fn(),
  download: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => h.search,
}));
vi.mock("@/lib/api", () => ({
  adminApi: {
    getSellerTrustLabParams: h.params,
    getSellerTrustLabScenarios: h.scenarios,
    runSellerTrustLabScenario: h.scenario,
    runSellerTrustLabSeller: h.seller,
    runSellerTrustLabPopulation: h.population,
  },
}));
vi.mock("@/lib/download", () => ({ downloadBlob: h.download }));
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("react-chartjs-2", () => ({
  Bar: ({ data }: { data: { labels: string[] } }) => (
    <div data-testid="histogram">{data.labels.join("|")}</div>
  ),
}));

import {
  apiError,
  bodyText,
  button,
  click,
  field,
  flush,
  mount,
  type,
  type Mounted,
} from "@/test-utils/dom";
import SellerTrustLabPage from "./page";
import { WINDOWS, V1_PARAMS, explanation, population } from "./_lib/fixtures";

const USER_ID = "8f0c6a1e-2b7d-4c3a-9e15-0d4b6f2a7c91";
const L = "admin.system.sellerTrustLab";

const paramsResponse = (isProd = false) => ({
  data: {
    formulaVersion: 1,
    v1: V1_PARAMS,
    limits: {},
    weightSumTolerance: 1e-9,
    components: ["rating", "reliability", "onTime", "volume", "tenure"],
    populationMaxRows: 20000,
    environment: { env: isProd ? "production" : "staging", isProd },
  },
});

const stored = {
  scoreX100: 374,
  level: "fair" as const,
  formulaVersion: 1,
  computedAt: "2026-11-02T00:30:00.000Z",
  components: null,
};

function seller(overrides: Partial<SellerTrustLabSeller> = {}) {
  return {
    userId: USER_ID,
    username: "demo-seller",
    asOf: { requested: "now", used: "now", at: "2026-11-03T10:00:00.000Z" },
    windows: WINDOWS,
    stored,
    notScored: null,
    live: {
      inputs: {} as never,
      hasActivity: true,
      v1: explanation(),
      candidate: null,
      comparison: { sameScore: true, changedInputs: [] },
    },
    ...overrides,
  } as SellerTrustLabSeller;
}

let page: Mounted;

async function open() {
  page = mount(<SellerTrustLabPage />);
  await flush();
}

const input = (name: string) =>
  field<HTMLInputElement>(`input[name="${name}"]`);

beforeEach(() => {
  vi.clearAllMocks();
  h.search = new URLSearchParams();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  h.params.mockResolvedValue(paramsResponse());
  h.scenarios.mockResolvedValue({ data: [] });
  h.scenario.mockResolvedValue({
    data: { v1: explanation(), candidate: null },
  });
  h.seller.mockResolvedValue({ data: seller() });
  h.population.mockResolvedValue({ data: population() });
});

afterEach(() => {
  page?.unmount();
  vi.unstubAllGlobals();
});

describe("page frame", () => {
  it("always shows the read-only and audit notices and the environment", async () => {
    await open();
    expect(bodyText()).toContain(`${L}.readOnlyNotice`);
    expect(bodyText()).toContain(`${L}.auditNotice`);
    expect(bodyText()).toContain(`${L}.env.staging`);
    expect(bodyText()).not.toContain(`${L}.prodWarning`);
    // the four cards
    for (const key of [
      `${L}.seller.title`,
      `${L}.scenario.title`,
      `${L}.params.title`,
      `${L}.population.title`,
    ]) {
      expect(bodyText()).toContain(key);
    }
  });

  it("marks production and warns about real data", async () => {
    h.params.mockResolvedValue(paramsResponse(true));
    await open();
    expect(bodyText()).toContain(`${L}.env.production`);
    expect(bodyText()).toContain(`${L}.prodWarning`);
    expect(bodyText()).toContain(`${L}.readOnlyNotice`);
  });

  it("keeps the notices when the page is refused", async () => {
    h.params.mockRejectedValue(apiError(403));
    await open();
    expect(bodyText()).toContain(`${L}.states.forbidden`);
    expect(bodyText()).toContain(`${L}.readOnlyNotice`);
    expect(bodyText()).not.toContain(`${L}.seller.title`);
  });

  it("says when the lab was called too often", async () => {
    h.params.mockRejectedValue(apiError(429));
    await open();
    expect(bodyText()).toContain(`${L}.states.throttled`);
  });

  it("shows the server message and retries on a failure", async () => {
    h.params.mockRejectedValueOnce(apiError(500, "server.x", "db down"));
    await open();
    expect(bodyText()).toContain(`${L}.states.error`);
    expect(bodyText()).toContain("db down");

    await click(button(`${L}.states.retry`));
    expect(h.params).toHaveBeenCalledTimes(2);
    expect(bodyText()).toContain(`${L}.seller.title`);
  });
});

describe("candidate parameters", () => {
  it("starts from v1 and blocks the runs while a value is invalid", async () => {
    await open();
    expect(input("weights.rating").value).toBe("0.4");
    expect(button(`${L}.population.run`).disabled).toBe(false);

    await type(input("weights.rating"), "0.9");
    await flush();

    expect(bodyText()).toContain(`${L}.params.errors.weightsSum`);
    expect(bodyText()).toContain(`${L}.params.modified`);
    expect(button(`${L}.population.run`).disabled).toBe(true);

    await click(button(`${L}.params.resetToV1`));
    await flush();
    expect(input("weights.rating").value).toBe("0.4");
    expect(button(`${L}.population.run`).disabled).toBe(false);
    expect(bodyText()).not.toContain(`${L}.params.errors.weightsSum`);
  });

  it("shows a range message on the field and re-checks the minimums together", async () => {
    await open();
    await type(input("rating.priorMean"), "9");
    await flush();
    expect(bodyText()).toContain(`${L}.params.errors.range`);

    await type(input("rating.priorMean"), "4");
    await type(input("minimum.counterparties"), "9");
    await flush();
    expect(bodyText()).toContain(`${L}.params.errors.counterparties`);
  });
});

describe("seller", () => {
  const run = async (id = USER_ID) => {
    await type(input("userId"), id);
    await click(button(`${L}.seller.run`));
  };

  it("refuses a user id that is not a UUID", async () => {
    await open();
    await run("not-an-id");
    expect(h.seller).not.toHaveBeenCalled();
    expect(bodyText()).toContain(`${L}.seller.userIdHint`);
  });

  it("explains a seller: v1 working, same as stored, windows, no candidate", async () => {
    await open();
    await run();

    expect(h.seller).toHaveBeenCalledWith(USER_ID, { asOf: "now" });
    expect(bodyText()).toContain("demo-seller");
    expect(bodyText()).toContain(`${L}.seller.matchesStored`);
    expect(bodyText()).toContain(`${L}.seller.storedTitle`);
    expect(bodyText()).toContain(`${L}.seller.recomputedTitle`);
    expect(bodyText()).toContain(`${L}.seller.unroundedScore`);
    expect(bodyText()).toContain("3,7412");
    expect(bodyText()).toContain(`${L}.seller.windows`);
    expect(
      document.querySelector('[data-testid="explain-candidate"]'),
    ).toBeNull();
  });

  it("says the data differs from the stored row and lists the changed inputs", async () => {
    h.seller.mockResolvedValue({
      data: seller({
        live: {
          ...seller().live!,
          comparison: {
            sameScore: false,
            changedInputs: [{ field: "failures", stored: 1, live: 3 }],
          },
        },
      }),
    });
    await open();
    await run();
    expect(bodyText()).toContain(`${L}.seller.differsFromStored`);
    expect(bodyText()).toContain("admin.users.detail.trust.counts.failures");
  });

  it("sends the valid candidate and labels it everywhere it appears", async () => {
    h.seller.mockResolvedValue({
      data: seller({
        live: {
          ...seller().live!,
          candidate: explanation({
            score: 4.1,
            roundedX100: 410,
            level: "trusted",
          }),
        },
      }),
    });
    await open();
    await type(input("weights.rating"), "0.5");
    await type(input("weights.volume"), "0");
    await type(input("weights.reliability"), "0.25");
    await type(input("weights.onTime"), "0.15");
    await type(input("weights.tenure"), "0.1");
    await flush();
    await type(input("userId"), USER_ID);
    await click(field('input[name="useCandidate"]'));
    await click(button(`${L}.seller.run`));

    const body = h.seller.mock.calls[0][1];
    expect(body.asOf).toBe("now");
    expect(body.params.weights.rating).toBe(0.5);
    const candidate = document.querySelector(
      '[data-testid="explain-candidate"]',
    );
    expect(candidate?.textContent).toContain(`${L}.candidateLabel`);
    expect(candidate?.textContent).toContain(`${L}.seller.candidateTitle`);
  });

  it("does not offer the candidate while the form is invalid", async () => {
    await open();
    await type(input("weights.rating"), "0.9");
    await flush();
    expect(field('input[name="useCandidate"]').hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("says the user was not found", async () => {
    h.seller.mockRejectedValue(apiError(404));
    await open();
    await run();
    expect(bodyText()).toContain(`${L}.seller.notFound`);
    expect(bodyText()).not.toContain(`${L}.states.retry`);
  });

  it("shows the reason and no score for an account that is not scored", async () => {
    h.seller.mockResolvedValue({
      data: seller({ notScored: "banned", live: null, stored: null }),
    });
    await open();
    await run();
    expect(bodyText()).toContain(`${L}.seller.notScored.banned`);
    expect(document.querySelector('[data-testid="explain-v1"]')).toBeNull();
  });

  it("still shows the live recompute for a seller without a stored row", async () => {
    h.seller.mockResolvedValue({
      data: seller({
        stored: null,
        live: { ...seller().live!, comparison: null },
        asOf: {
          requested: "stored",
          used: "now",
          at: "2026-11-03T10:00:00.000Z",
        },
      }),
    });
    await open();
    await run();
    expect(bodyText()).toContain(`${L}.seller.noStoredRow`);
    expect(bodyText()).toContain(`${L}.seller.asOfFallback`);
    expect(document.querySelector('[data-testid="explain-v1"]')).not.toBeNull();
  });

  it("shows the minimums when there is not enough data, sub-scores still shown", async () => {
    h.seller.mockResolvedValue({
      data: seller({
        live: {
          ...seller().live!,
          v1: explanation({
            scoreX100: null,
            level: "new",
            minimum: { transactions: 3, counterparties: 3, met: false },
          }),
        },
      }),
    });
    await open();
    await run();
    expect(bodyText()).toContain(`${L}.seller.notEnoughData`);
    expect(bodyText()).toContain("admin.users.detail.trust.colSubScore");
  });

  it("shows throttling and keeps the form values", async () => {
    h.seller.mockRejectedValue(apiError(429));
    await open();
    await run();
    expect(bodyText()).toContain(`${L}.states.throttled`);
    expect(input("userId").value).toBe(USER_ID);
  });

  it("runs once on arrival from a deep link", async () => {
    h.search = new URLSearchParams({ userId: USER_ID });
    await open();
    expect(h.seller).toHaveBeenCalledTimes(1);
    expect(h.seller).toHaveBeenCalledWith(USER_ID, { asOf: "now" });
    expect(input("userId").value).toBe(USER_ID);
  });

  it("calls the audited endpoint once per click, never on its own", async () => {
    await open();
    await run();
    expect(h.seller).toHaveBeenCalledTimes(1);

    // Focus and a network reconnect must not re-run a real-seller read.
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await flush();
    expect(h.seller).toHaveBeenCalledTimes(1);

    // The same request again is an explicit re-run: one more call.
    await click(button(`${L}.seller.run`));
    expect(h.seller).toHaveBeenCalledTimes(2);
  });

  it("ignores a deep link that is not a UUID", async () => {
    h.search = new URLSearchParams({ userId: "nope" });
    await open();
    expect(h.seller).not.toHaveBeenCalled();
    expect(input("userId").value).toBe("");
  });
});

describe("scenario calculator", () => {
  it("lists the reference scenarios with their approved result", async () => {
    h.scenarios.mockResolvedValue({
      data: [
        {
          id: 1,
          key: "aNew",
          inputs: {},
          approved: { scoreX100: null, level: "new" },
          v1: explanation(),
        },
        {
          id: 3,
          key: "eSteady",
          inputs: {},
          approved: { scoreX100: 374, level: "fair" },
          v1: explanation(),
        },
      ],
    });
    await open();
    expect(bodyText()).toContain(`${L}.golden.name.newSeller`);
    expect(bodyText()).toContain(`${L}.golden.name.steady`);
    expect(bodyText()).toContain("3,74");
  });

  it("runs without any seller and shows the formula working", async () => {
    await open();
    await type(input("raters"), "12");
    await type(input("meanRating"), "4.8");
    await type(input("eligibleOrders"), "15");
    await flush();
    await click(button(`${L}.scenario.run`));

    expect(h.scenario).toHaveBeenCalledTimes(1);
    const body = h.scenario.mock.calls[0][0];
    expect(body.inputs.raters).toBe(12);
    expect(body.inputs.sumOfGiverMeans).toBeCloseTo(57.6);
    expect(body.params).toBeUndefined();
    expect(h.seller).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-testid="scenario-result"]'),
    ).not.toBeNull();
  });

  it("blocks a scenario whose counts contradict each other", async () => {
    await open();
    await type(input("eligibleOrders"), "5");
    await type(input("failures"), "9");
    await flush();
    expect(bodyText()).toContain(`${L}.scenario.errors.aboveEligibleOrders`);
    expect(button(`${L}.scenario.run`).disabled).toBe(true);
  });

  it("applies a changed, valid candidate next to v1", async () => {
    h.scenario.mockResolvedValue({
      data: { v1: explanation(), candidate: explanation({ level: "trusted" }) },
    });
    await open();
    await type(input("volume.saturation"), "80");
    await flush();
    await click(button(`${L}.scenario.run`));
    expect(h.scenario.mock.calls[0][0].params.volume.saturation).toBe(80);
    expect(
      document.querySelector('[data-testid="explain-candidate"]'),
    ).not.toBeNull();
  });
});

describe("population", () => {
  const run = () => click(button(`${L}.population.run`));

  it("runs the valid candidate and shows the summary", async () => {
    await open();
    await run();

    expect(h.population).toHaveBeenCalledWith({
      params: V1_PARAMS,
      filters: {},
    });
    const text = bodyText();
    expect(text).toContain(`${L}.population.consistency.title`);
    expect(text).toContain(`${L}.population.levelCounts`);
    expect(text).toContain(`${L}.population.matrix`);
    expect(text).toContain(`${L}.population.moversUp`);
    expect(text).toContain("riser");
    expect(text).toContain(`${L}.candidateLabel`);
    expect(text).toContain("0,0 - 0,5");
    expect(text).not.toContain(`${L}.population.inProgress`);
    expect(text).not.toContain(`${L}.population.consistency.warning`);
  });

  it("does not re-run the audited population read on a reconnect", async () => {
    await open();
    await run();
    expect(h.population).toHaveBeenCalledTimes(1);
    await act(async () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await flush();
    expect(h.population).toHaveBeenCalledTimes(1);
  });

  it("sends the filters", async () => {
    await open();
    await click(field('input[name="levels.fair"]'));
    await type(input("minTransactions"), "5");
    await run();
    expect(h.population.mock.calls[0][0].filters).toEqual({
      levels: ["fair"],
      minTransactions: 5,
    });
  });

  it("warns when stored scores do not match the formula", async () => {
    h.population.mockResolvedValue({
      data: population({
        v1Consistency: { matched: 12, offByOne: 1, mismatched: 2 },
      }),
    });
    await open();
    await run();
    expect(bodyText()).toContain(`${L}.population.consistency.warning`);
  });

  it("says a nightly run may be in progress when computed times are mixed", async () => {
    h.population.mockResolvedValue({
      data: population({
        computedAt: {
          min: "2026-11-02T00:30:00.000Z",
          max: "2026-11-02T01:10:00.000Z",
        },
      }),
    });
    await open();
    await run();
    expect(bodyText()).toContain(`${L}.population.inProgress`);
  });

  it("shows the empty state, and the no-match state under filters", async () => {
    h.population.mockResolvedValue({ data: population({ rowsRead: 0 }) });
    await open();
    await run();
    expect(bodyText()).toContain(`${L}.population.empty`);

    h.population.mockResolvedValue({
      data: {
        ...population({ rowsRead: 0 }),
        filters: { minTransactions: 999 },
      },
    });
    await type(input("minTransactions"), "999");
    await run();
    expect(bodyText()).toContain(`${L}.population.noMatch`);
  });

  it("shows the server message when the population is too large", async () => {
    h.population.mockRejectedValue(
      apiError(
        422,
        "server.sellerTrustLab.populationTooLarge",
        "Too many rows (limit 20000)",
      ),
    );
    await open();
    await run();
    expect(bodyText()).toContain("Too many rows (limit 20000)");
  });

  it("disables the run while the candidate is invalid", async () => {
    await open();
    await type(input("weights.rating"), "0.9");
    await flush();
    await click(button(`${L}.population.run`));
    expect(h.population).not.toHaveBeenCalled();
  });

  it("downloads the proposal as it is, with no user id or username", async () => {
    const data = population();
    h.population.mockResolvedValue({ data });
    await open();
    await run();
    await click(button(`${L}.population.download`));

    expect(h.download).toHaveBeenCalledTimes(1);
    const [filename, content, mime] = h.download.mock.calls[0];
    expect(filename).toBe("seller-trust-proposal-2026-11-03.json");
    expect(mime).toContain("application/json");
    const file = JSON.parse(content as string);
    expect(file).toEqual(data.proposal);
    expect(file.baseVersion).toBe(1);
    expect(Object.keys(file)).toEqual(
      expect.arrayContaining([
        "params",
        "summary",
        "environment",
        "generatedAt",
        "baseVersion",
      ]),
    );
    expect(content).not.toMatch(/userId|username/);
  });
});
