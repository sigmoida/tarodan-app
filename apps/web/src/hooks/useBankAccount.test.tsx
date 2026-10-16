// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query/keys";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  get: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  bankAccountApi: { get: h.get, upsert: h.upsert, delete: h.remove },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import {
  useBankAccount,
  useDeleteBankAccount,
  useSaveBankAccount,
} from "./useBankAccount";

let container: HTMLDivElement;
let root: Root;
let qc: QueryClient;
const seen: Array<ReturnType<typeof useBankAccount>> = [];
let save: ReturnType<typeof useSaveBankAccount>;
let del: ReturnType<typeof useDeleteBankAccount>;

function Consumer({ enabled = true }: { enabled?: boolean }) {
  seen.push(useBankAccount(enabled));
  return null;
}

function Writers() {
  save = useSaveBankAccount();
  del = useDeleteBankAccount();
  return null;
}

async function render(node: ReactNode) {
  await act(async () => {
    root.render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  });
}

const account = {
  id: "1",
  accountHolder: "Ali Veli",
  iban: "TR330006100519786457841326",
};

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seen.length = 0;
  h.get.mockReset();
  h.upsert.mockReset().mockResolvedValue({});
  h.remove.mockReset().mockResolvedValue({});
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useBankAccount", () => {
  it("tek anahtar: iki tüketici tek istek yapar, cache bankAccount.detail()", async () => {
    h.get.mockResolvedValue({ data: account });
    await render(
      <>
        <Consumer />
        <Consumer />
      </>,
    );
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(queryKeys.bankAccount.detail())).toEqual(account);
    expect(seen.at(-1)?.account).toEqual(account);
  });

  it("kayıt yoksa (boş gövde) account null", async () => {
    h.get.mockResolvedValue({ data: "" });
    await render(<Consumer />);
    expect(seen.at(-1)).toEqual({ account: null, isLoading: false });
    expect(qc.getQueryData(queryKeys.bankAccount.detail())).toBeNull();
  });

  it("enabled=false iken istek atmaz", async () => {
    await render(<Consumer enabled={false} />);
    expect(h.get).not.toHaveBeenCalled();
    expect(seen.at(-1)?.isLoading).toBe(false);
  });
});

describe("useSaveBankAccount / useDeleteBankAccount", () => {
  it("kayıt payload'ı normalize eder ve tek anahtarı tazeler", async () => {
    h.get.mockResolvedValueOnce({ data: null });
    await render(
      <>
        <Consumer />
        <Writers />
      </>,
    );
    h.get.mockResolvedValue({ data: account });

    await act(async () => {
      await save.mutateAsync({
        accountHolder: "  Ali Veli ",
        iban: "tr33 0006 1005 1978 6457 8413 26",
        taxId: " ",
      });
    });

    expect(h.upsert).toHaveBeenCalledWith({
      accountHolder: "Ali Veli",
      iban: "TR330006100519786457841326",
    });
    expect(h.get).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)?.account).toEqual(account);
  });

  it("taxId doluysa kırpılıp gönderilir", async () => {
    h.get.mockResolvedValue({ data: null });
    await render(<Writers />);
    await act(async () => {
      await save.mutateAsync({
        accountHolder: "A B",
        iban: "TR330006100519786457841326",
        taxId: " 1234567890 ",
      });
    });
    expect(h.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ taxId: "1234567890" }),
    );
  });

  it("silme de aynı anahtarı tazeler", async () => {
    h.get.mockResolvedValueOnce({ data: account });
    await render(
      <>
        <Consumer />
        <Writers />
      </>,
    );
    h.get.mockResolvedValue({ data: null });

    await act(async () => {
      await del.mutateAsync();
    });

    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)?.account).toBeNull();
  });
});
