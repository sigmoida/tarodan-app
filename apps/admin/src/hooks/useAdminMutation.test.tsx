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
  successMessage?: string | ((data: unknown) => string | undefined);
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

  it("builds the success toast from the response when given a function", async () => {
    let n = 0;
    const view = mount(
      <Probe
        fn={() => Promise.resolve(++n)}
        successMessage={(data) => (data === 1 ? `done ${data}` : undefined)}
      />,
    );
    await submitTwice();
    // The second response builds no message: no toast for it.
    expect(h.toast.success).toHaveBeenCalledTimes(1);
    expect(h.toast.success.mock.calls[0][0]).toBe("done 1");
    view.unmount();
  });

  it("keeps a write successful when the toast builder throws", async () => {
    const onSuccess = vi.fn();
    function Thrower() {
      const m = useAdminMutation(() => Promise.resolve({}), {
        successMessage: () => {
          throw new TypeError("unexpected shape");
        },
        onSuccess,
      });
      return (
        <Button type="button" onClick={() => m.mutate()}>
          go
        </Button>
      );
    }
    const view = mount(<Thrower />);
    await act(async () => {
      button("go").click();
    });
    await flush();

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
    view.unmount();
  });
});
