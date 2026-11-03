// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { Button } from "@tarodan/ui";

const h = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});

import { button, flush, mount } from "@/test-utils/dom";
import { useAdminMutation } from "./useAdminMutation";

function Probe({
  fn,
  successMessage,
}: {
  fn: () => Promise<unknown>;
  successMessage?: string;
}) {
  const m = useAdminMutation(fn, { successMessage });
  return (
    <Button
      type="button"
      onClick={() => {
        // Two submits in one tick: the pending state has not re-rendered yet.
        m.mutate();
        m.mutate();
      }}
    >
      go
    </Button>
  );
}

const ids = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.map((c) => c[1]?.id);

async function submitTwice() {
  await act(async () => {
    button("go").click();
  });
  await flush();
}

describe("useAdminMutation toasts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gives identical error toasts one id, so a double submit shows one toast", async () => {
    const view = mount(
      <Probe
        fn={() => Promise.reject({ response: { data: { message: "bad" } } })}
      />,
    );
    await submitTwice();
    expect(h.toast.error).toHaveBeenCalledTimes(2);
    const [a, b] = ids(h.toast.error);
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    view.unmount();
  });

  it("keeps different error messages as separate toasts", async () => {
    let n = 0;
    const view = mount(
      <Probe
        fn={() =>
          Promise.reject({ response: { data: { message: `bad ${++n}` } } })
        }
      />,
    );
    await submitTwice();
    expect(h.toast.error).toHaveBeenCalledTimes(2);
    const [a, b] = ids(h.toast.error);
    expect(a).not.toBe(b);
    view.unmount();
  });

  it("dedupes the success toast the same way", async () => {
    const view = mount(
      <Probe fn={() => Promise.resolve("ok")} successMessage="saved" />,
    );
    await submitTwice();
    expect(h.toast.success).toHaveBeenCalledTimes(2);
    const [a, b] = ids(h.toast.success);
    expect(a).toBe(b);
    view.unmount();
  });
});
