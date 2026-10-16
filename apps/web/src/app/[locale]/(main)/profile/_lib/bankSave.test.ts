/** @format */

import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { finishBankSave } from "./bankSave";

const key = queryKeys.bankAccount.detail();

describe("finishBankSave", () => {
  it("push'tan önce inaktif cache'i yeniden çeker", async () => {
    const qc = new QueryClient();
    let server: { iban: string } | null = null;
    const queryFn = async () => server;
    await qc.fetchQuery({ queryKey: key, queryFn });
    expect(qc.getQueryData(key)).toBeNull();

    server = { iban: "TR1" };
    const push = vi.fn(() => {
      expect(qc.getQueryData(key)).toEqual({ iban: "TR1" });
    });
    await finishBankSave(qc, "/listings/new", push);
    expect(push).toHaveBeenCalledWith("/listings/new");
  });

  it("returnTo yoksa hiçbir şey yapmaz", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "refetchQueries");
    const push = vi.fn();
    await finishBankSave(qc, null, push);
    expect(spy).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
