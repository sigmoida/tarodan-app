// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  tier: "free" as string | undefined,
  mounts: 0,
  props: null as null | {
    listing: { id: string };
    canRemind: boolean;
    onClose: () => void;
  },
}));

// The lazy dialog becomes a probe that records its props and its mounts.
vi.mock("next/dynamic", async () => {
  const { useEffect } = await import("react");
  return {
    default: () =>
      function DialogProbe(props: NonNullable<typeof h.props>) {
        h.props = props;
        useEffect(() => {
          h.mounts += 1;
        }, []);
        return null;
      },
  };
});
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({ user: h.tier ? { membershipTier: h.tier } : null }),
}));

import { useBoostLauncher, type BoostLauncher } from "./useBoostLauncher";

let container: HTMLDivElement;
let root: Root;
let launcher: BoostLauncher;

function Host() {
  launcher = useBoostLauncher();
  return <>{launcher.dialog}</>;
}

const render = () => act(() => root.render(<Host />));
const LISTING = { id: "listing-1", title: "Ferrari", boostedUntil: null };

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  h.tier = "free";
  h.mounts = 0;
  h.props = null;
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useBoostLauncher", () => {
  it("renders no dialog until a listing is opened", () => {
    render();
    expect(launcher.dialog).toBeNull();
    expect(h.mounts).toBe(0);
  });

  it("opens the dialog for the listing and closes it", () => {
    render();
    act(() => launcher.open(LISTING));
    expect(h.props?.listing).toEqual(LISTING);
    expect(h.mounts).toBe(1);

    act(() => h.props!.onClose());
    expect(launcher.dialog).toBeNull();
  });

  it("mounts a fresh dialog on every opening, so consents never carry over", () => {
    render();
    act(() => launcher.open(LISTING));
    act(() => h.props!.onClose());
    act(() => launcher.open(LISTING));
    expect(h.mounts).toBe(2);
  });

  it("mounts a fresh dialog when another listing is opened over an open one", () => {
    render();
    act(() => launcher.open(LISTING));
    act(() => launcher.open({ ...LISTING, id: "listing-2" }));
    expect(h.props?.listing.id).toBe("listing-2");
    expect(h.mounts).toBe(2);
  });

  it.each([
    ["free", false],
    [undefined, false],
    ["basic", true],
    ["premium", true],
    ["business", true],
  ])("tier %s may set the reminder: %s", (tier, canRemind) => {
    h.tier = tier;
    render();
    act(() => launcher.open(LISTING));
    expect(h.props?.canRemind).toBe(canRemind);
  });
});
