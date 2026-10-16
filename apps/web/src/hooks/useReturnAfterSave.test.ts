/** @format */

import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { PROFILE_GATE } from "@/lib/profileGate";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { finishWithReturn } from "./useReturnAfterSave";

const okAddress = {
  id: "1",
  phone: "+905321234567",
  city: "İstanbul",
  district: "Kadıköy",
  address: "Bir sokak 1",
};

describe.each([
  ["bank", { iban: "TR1" }, null],
  ["address", [okAddress], []],
] as const)("finishWithReturn (%s kapısı)", (section, filled, empty) => {
  const { queryKey, isOpen } = PROFILE_GATE[section];

  it("push'tan önce inaktif cache'i yeniden çeker", async () => {
    const qc = new QueryClient();
    let server: unknown = empty;
    await qc.fetchQuery({ queryKey, queryFn: async () => server });

    server = filled;
    const push = vi.fn(() => {
      expect(qc.getQueryData(queryKey)).toEqual(filled);
    });
    await finishWithReturn(qc, queryKey, "/listings/new", push, isOpen);
    expect(push).toHaveBeenCalledWith("/listings/new");
  });

  it("kapı hâlâ kapalıysa dönmez", async () => {
    const qc = new QueryClient();
    await qc.fetchQuery({ queryKey, queryFn: async () => empty });
    const push = vi.fn();
    await finishWithReturn(qc, queryKey, "/listings/new", push, isOpen);
    expect(push).not.toHaveBeenCalled();
  });

  it("returnTo yoksa hiçbir şey yapmaz", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "refetchQueries");
    const push = vi.fn();
    await finishWithReturn(qc, queryKey, null, push, isOpen);
    expect(spy).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("uçuştaki isteği iptal etmez (cancelRefetch: false)", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "refetchQueries");
    await finishWithReturn(qc, queryKey, "/x", vi.fn());
    expect(spy).toHaveBeenCalledWith(
      { queryKey, type: "all" },
      expect.objectContaining({ cancelRefetch: false }),
    );
  });

  it("tazeleme patlarsa kapı durumu bilinemez: yine döner", async () => {
    const qc = new QueryClient();
    vi.spyOn(qc, "refetchQueries").mockRejectedValue(new Error("boom"));
    const push = vi.fn();
    await finishWithReturn(qc, queryKey, "/listings/new", push, isOpen);
    expect(push).toHaveBeenCalledWith("/listings/new");
  });
});
