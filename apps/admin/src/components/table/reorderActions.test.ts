import { describe, expect, it, vi } from "vitest";
import { moveActions } from "./reorderActions";

const t = ((k: string) => k) as never;

describe("moveActions", () => {
  it("disables up on the first row and down on the last", () => {
    const [up, down] = moveActions(vi.fn(), { index: 0, total: 3 }, t);
    expect(up.disabled).toBe(true);
    expect(down.disabled).toBe(false);
    const [up2, down2] = moveActions(vi.fn(), { index: 2, total: 3 }, t);
    expect(up2.disabled).toBe(false);
    expect(down2.disabled).toBe(true);
  });

  it("disables both while a move is in flight", () => {
    const [up, down] = moveActions(vi.fn(), { index: 1, total: 3 }, t, true);
    expect(up.disabled).toBe(true);
    expect(down.disabled).toBe(true);
  });

  it("reports the direction", () => {
    const onMove = vi.fn();
    const [up, down] = moveActions(onMove, { index: 1, total: 3 }, t);
    up.onClick();
    down.onClick();
    expect(onMove.mock.calls).toEqual([[-1], [1]]);
  });
});
