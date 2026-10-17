// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEMBERSHIP_SETTLE_ATTEMPTS,
  MEMBERSHIP_SETTLE_INTERVAL_MS,
} from "@/lib/membershipSettle";
import { queryKeys } from "@/lib/query/keys";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const getCurrentMembership = vi.fn();
const getLimits = vi.fn();

vi.mock("@/lib/api", () => ({
  membershipApi: {
    getCurrentMembership: () => getCurrentMembership(),
    getLimits: () => getLimits(),
  },
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ user: { membershipTier: "free" } }) },
}));

import { useMembershipSettle } from "./useMembershipSettle";

const meOf = (tier: string) => ({ data: { tier: { type: tier } } });
const limitsOf = (isAdFree: boolean) => ({ data: { isAdFree } });

describe("useMembershipSettle", () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  function Probe(props: { expectedTier?: string | null; skipWait?: boolean }) {
    useMembershipSettle(props);
    return null;
  }

  const mount = (props: Parameters<typeof Probe>[0]) =>
    act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe {...props} />
        </QueryClientProvider>,
      );
    });

  const tick = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  beforeEach(() => {
    vi.useFakeTimers();
    getCurrentMembership.mockReset();
    getLimits.mockReset();
    client = new QueryClient();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("PayTR dönüşü: katman değişene kadar yoklar, isAdFree'yi önbelleğe yazar ve durur", async () => {
    // Önce eski katman (ödeme henüz doğrulanmadı), sonra yeni katman.
    getCurrentMembership
      .mockResolvedValueOnce(meOf("free"))
      .mockResolvedValueOnce(meOf("free"))
      .mockResolvedValue(meOf("premium"));
    getLimits
      .mockResolvedValueOnce(limitsOf(false))
      .mockResolvedValueOnce(limitsOf(false))
      .mockResolvedValue(limitsOf(true));

    await mount({});
    expect(client.getQueryData(queryKeys.membership.limits())).toEqual({
      isAdFree: false,
    });

    await tick(MEMBERSHIP_SETTLE_INTERVAL_MS);
    await tick(MEMBERSHIP_SETTLE_INTERVAL_MS);

    expect(client.getQueryData(queryKeys.membership.limits())).toEqual({
      isAdFree: true,
    });
    expect(getCurrentMembership).toHaveBeenCalledTimes(3);

    // Yansıdı → artık yoklamaz.
    await tick(MEMBERSHIP_SETTLE_INTERVAL_MS * 3);
    expect(getCurrentMembership).toHaveBeenCalledTimes(3);
  });

  it("hedef katman (URL) biliniyorsa ona ulaşınca durur", async () => {
    getCurrentMembership
      .mockResolvedValueOnce(meOf("basic"))
      .mockResolvedValue(meOf("premium"));
    getLimits.mockResolvedValue(limitsOf(true));

    await mount({ expectedTier: "premium" });
    await tick(MEMBERSHIP_SETTLE_INTERVAL_MS);
    expect(getCurrentMembership).toHaveBeenCalledTimes(2);
    await tick(MEMBERSHIP_SETTLE_INTERVAL_MS * 3);
    expect(getCurrentMembership).toHaveBeenCalledTimes(2);
  });

  it("katman hiç değişmezse en çok MEMBERSHIP_SETTLE_ATTEMPTS kez yoklar", async () => {
    getCurrentMembership.mockResolvedValue(meOf("free"));
    getLimits.mockResolvedValue(limitsOf(false));

    await mount({});
    await tick(
      MEMBERSHIP_SETTLE_INTERVAL_MS * (MEMBERSHIP_SETTLE_ATTEMPTS + 3),
    );

    expect(getCurrentMembership).toHaveBeenCalledTimes(
      MEMBERSHIP_SETTLE_ATTEMPTS,
    );
  });

  it("ertelemeli düşürmede (skipWait) tek tur", async () => {
    getCurrentMembership.mockResolvedValue(meOf("premium"));
    getLimits.mockResolvedValue(limitsOf(true));

    await mount({ expectedTier: "basic", skipWait: true });
    await tick(MEMBERSHIP_SETTLE_INTERVAL_MS * 4);

    expect(getCurrentMembership).toHaveBeenCalledTimes(1);
  });

  it("geçici hatada sonraki turda yeniden dener", async () => {
    getCurrentMembership
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(meOf("premium"));
    getLimits.mockResolvedValue(limitsOf(true));

    await mount({});
    await tick(MEMBERSHIP_SETTLE_INTERVAL_MS);

    expect(getCurrentMembership).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(queryKeys.membership.limits())).toEqual({
      isAdFree: true,
    });
  });

  it("sayfadan çıkınca yoklama durur", async () => {
    getCurrentMembership.mockResolvedValue(meOf("free"));
    getLimits.mockResolvedValue(limitsOf(false));

    await mount({});
    await act(async () => root.unmount());
    await tick(MEMBERSHIP_SETTLE_INTERVAL_MS * 4);

    expect(getCurrentMembership).toHaveBeenCalledTimes(1);
    root = createRoot(container); // afterEach unmount için
  });
});
