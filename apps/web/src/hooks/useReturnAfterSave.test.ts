/** @format */

import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { finishWithReturn } from "./useReturnAfterSave";

describe.each([
  ["banka hesabı", queryKeys.bankAccount.detail()],
  ["adres", queryKeys.addresses.all()],
])("finishWithReturn (%s)", (_name, key) => {
  it("push'tan önce inaktif cache'i yeniden çeker", async () => {
    const qc = new QueryClient();
    let server: unknown = null;
    await qc.fetchQuery({ queryKey: key, queryFn: async () => server });
    expect(qc.getQueryData(key)).toBeNull();

    server = [{ id: "1" }];
    const push = vi.fn(() => {
      expect(qc.getQueryData(key)).toEqual([{ id: "1" }]);
    });
    await finishWithReturn(qc, key, "/listings/new", push);
    expect(push).toHaveBeenCalledWith("/listings/new");
  });

  it("returnTo yoksa hiçbir şey yapmaz", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "refetchQueries");
    const push = vi.fn();
    await finishWithReturn(qc, key, null, push);
    expect(spy).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("tazeleme patlasa da yine döner", async () => {
    const qc = new QueryClient();
    vi.spyOn(qc, "refetchQueries").mockRejectedValue(new Error("boom"));
    const push = vi.fn();
    await finishWithReturn(qc, key, "/listings/new", push);
    expect(push).toHaveBeenCalledWith("/listings/new");
  });
});
