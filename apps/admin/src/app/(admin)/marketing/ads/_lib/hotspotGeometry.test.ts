import { describe, expect, it } from "vitest";
import {
  clamp01,
  isRectValid,
  moveRect,
  othersOf,
  pointerToFraction,
  rectFromPoints,
  resizeRect,
  snapBack,
} from "./hotspotGeometry";

const box = { left: 100, top: 50, width: 400, height: 200 };
const r = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

describe("clamp01 / pointerToFraction", () => {
  it("clamps to 0..1 and treats NaN as 0", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });

  it("converts pixels to fractions of the image box", () => {
    expect(pointerToFraction(300, 150, box)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("clamps pointers outside the image", () => {
    expect(pointerToFraction(0, 1000, box)).toEqual({ x: 0, y: 1 });
    expect(pointerToFraction(900, -5, box)).toEqual({ x: 1, y: 0 });
  });

  it("returns the origin for a collapsed box", () => {
    expect(pointerToFraction(5, 5, { ...box, width: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("rectFromPoints", () => {
  it("normalizes any drag direction", () => {
    const expected = r(0.2, 0.1, 0.3, 0.4);
    expect(rectFromPoints({ x: 0.2, y: 0.1 }, { x: 0.5, y: 0.5 })).toEqual(
      expected,
    );
    expect(rectFromPoints({ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.1 })).toEqual(
      expected,
    );
  });
});

describe("moveRect", () => {
  it("moves by delta and keeps the size", () => {
    expect(moveRect(r(0.1, 0.1, 0.2, 0.2), 0.1, 0.2)).toEqual(
      r(0.2, 0.3, 0.2, 0.2),
    );
  });

  it("stops at the image edge instead of leaving it", () => {
    expect(moveRect(r(0.7, 0.7, 0.2, 0.2), 0.5, 0.5)).toEqual(
      r(0.8, 0.8, 0.2, 0.2),
    );
    expect(moveRect(r(0.1, 0.1, 0.2, 0.2), -0.5, -0.5)).toEqual(
      r(0, 0, 0.2, 0.2),
    );
  });
});

describe("resizeRect", () => {
  const base = r(0.2, 0.2, 0.2, 0.2);

  it("keeps the opposite corner fixed (se)", () => {
    expect(resizeRect(base, "se", { x: 0.6, y: 0.5 })).toEqual(
      r(0.2, 0.2, 0.4, 0.3),
    );
  });

  it("keeps the opposite corner fixed (nw)", () => {
    expect(resizeRect(base, "nw", { x: 0.1, y: 0 })).toEqual(
      r(0.1, 0, 0.3, 0.4),
    );
  });

  it("allows dragging a handle past the opposite corner (flip)", () => {
    expect(resizeRect(base, "se", { x: 0.1, y: 0.1 })).toEqual(
      r(0.1, 0.1, 0.1, 0.1),
    );
  });
});

describe("isRectValid / snapBack", () => {
  const other = r(0.5, 0.5, 0.3, 0.3);

  it("rejects rects below the minimum size", () => {
    expect(isRectValid(r(0.1, 0.1, 0.02, 0.2), [])).toBe(false);
    expect(isRectValid(r(0.1, 0.1, 0.03, 0.03), [])).toBe(true);
  });

  it("rejects out-of-bounds and overlapping rects", () => {
    expect(isRectValid(r(0.9, 0.1, 0.2, 0.2), [])).toBe(false);
    expect(isRectValid(r(0.4, 0.4, 0.2, 0.2), [other])).toBe(false);
  });

  it("accepts rects that only touch an edge", () => {
    expect(isRectValid(r(0.2, 0.5, 0.3, 0.3), [other])).toBe(true);
  });

  it("snaps back to the last valid rect when the candidate overlaps", () => {
    const last = r(0.1, 0.1, 0.2, 0.2);
    expect(snapBack(r(0.45, 0.45, 0.2, 0.2), last, [other])).toBe(last);
  });

  it("takes the candidate when valid, and null when nothing valid exists yet", () => {
    const ok = r(0.1, 0.1, 0.2, 0.2);
    expect(snapBack(ok, null, [other])).toBe(ok);
    expect(snapBack(r(0.45, 0.45, 0.2, 0.2), null, [other])).toBeNull();
  });
});

describe("othersOf", () => {
  it("omits the edited index", () => {
    const list = [r(0, 0, 0.1, 0.1), r(0.5, 0.5, 0.1, 0.1)];
    expect(othersOf(list, 0)).toEqual([list[1]]);
    expect(othersOf(list, null)).toEqual(list);
  });
});
