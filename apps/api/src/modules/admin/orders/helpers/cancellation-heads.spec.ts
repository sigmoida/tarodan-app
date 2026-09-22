import {
  cancellationHeadComparator,
  type CancellationHead,
} from "./cancellation-heads";

const head = (id: string, at: string | null): CancellationHead => ({
  kind: "order",
  id,
  cancelledAt: at ? new Date(at) : null,
});

describe("cancellationHeadComparator", () => {
  const rows = [
    head("old", "2026-09-01T00:00:00.000Z"),
    head("legacy", null),
    head("new", "2026-09-20T00:00:00.000Z"),
  ];

  it("newest first by default, unstamped last", () => {
    expect(
      [...rows].sort(cancellationHeadComparator("desc")).map((r) => r.id),
    ).toEqual(["new", "old", "legacy"]);
  });

  it("oldest first ascending — unstamped STILL last", () => {
    expect(
      [...rows].sort(cancellationHeadComparator("asc")).map((r) => r.id),
    ).toEqual(["old", "new", "legacy"]);
  });

  it("ties (and two unstamped rows) compare equal so source order wins", () => {
    const compare = cancellationHeadComparator("desc");
    expect(compare(head("a", null), head("b", null))).toBe(0);
    expect(
      compare(
        head("a", "2026-09-01T00:00:00.000Z"),
        head("b", "2026-09-01T00:00:00.000Z"),
      ),
    ).toBe(0);
  });
});
