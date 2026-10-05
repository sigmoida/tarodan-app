// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LegalIdentityStatus } from "@tarodan/types";
import type { RequiredStepState } from "@/lib/requiredSteps";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Onay ve kimlik pencereleri tek montaj noktasından, sırayla ve aynı anda
 * YALNIZ BİRİ olarak çizilir. Pencerelerin kendisi burada ölçülmez (onlar
 * kendi bileşenleri); bu test "üst üste binmez" sözleşmesini sabitler.
 */

const state = vi.hoisted(() => ({
  pathname: "/",
  consents: "done" as RequiredStepState,
  identity: "done" as RequiredStepState,
}));

vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));

// Sıra kuralı GERÇEK `activeRequiredStep`ten gelir; yalnız sorgular sahte.
vi.mock("@/hooks/useRequiredSteps", async () => {
  const { activeRequiredStep } = await vi.importActual<
    typeof import("@/lib/requiredSteps")
  >("@/lib/requiredSteps");
  const identityStatus: LegalIdentityStatus = {
    required: true,
    missing: ["nationalId"],
    legalFirstName: "Ayşe",
    legalLastName: "Yılmaz",
    nationalIdMasked: null,
    suggestedNationalId: null,
  };
  return {
    useRequiredSteps: () => ({
      active: activeRequiredStep({
        consents: state.consents,
        legalIdentity: state.identity,
      }),
      consents: { pending: [], accept: {}, state: state.consents },
      identity: {
        status: identityStatus,
        submit: {},
        state: state.identity,
      },
    }),
  };
});

vi.mock("@/components/legal/ConsentGate", () => ({
  default: () => <div data-gate="consents" />,
}));

vi.mock("@/components/identity/LegalIdentityGate", () => ({
  default: () => <div data-gate="legalIdentity" />,
}));

import RequiredStepsGate from "./RequiredStepsGate";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  state.pathname = "/";
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const renderedGates = () => {
  act(() => root.render(<RequiredStepsGate />));
  return [...container.querySelectorAll("[data-gate]")].map((el) =>
    el.getAttribute("data-gate"),
  );
};

describe("RequiredStepsGate", () => {
  it("onay ve kimlik birlikte bekliyorsa YALNIZ onay penceresi çizilir", () => {
    state.consents = "pending";
    state.identity = "pending";
    expect(renderedGates()).toEqual(["consents"]);
  });

  it("onaylar tamamlanınca kimlik penceresi tek başına çizilir", () => {
    state.consents = "done";
    state.identity = "pending";
    expect(renderedGates()).toEqual(["legalIdentity"]);
  });

  it("onay durumu yüklenirken hiçbir pencere çizilmez", () => {
    state.consents = "unknown";
    state.identity = "pending";
    expect(renderedGates()).toEqual([]);
  });

  it("yasal metin sayfasında hiçbir zorunlu pencere çizilmez", () => {
    state.consents = "pending";
    state.identity = "pending";
    state.pathname = "/privacy";
    expect(renderedGates()).toEqual([]);
  });
});
