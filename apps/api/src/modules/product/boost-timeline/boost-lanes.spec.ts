import {
  boostCapMs,
  boostShowcaseEnd,
  ceilSeconds,
  laneEntries,
  layLane,
  type LaneBoost,
} from "./boost-lanes";

const NOW = new Date("2026-10-21T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW.getTime() + ms);

const lane = (
  id: string,
  endsAt: Date,
  capDays = 30,
  purchasedAt: Date | null = null,
): LaneBoost => ({ id, endsAt, capMs: capDays * DAY, purchasedAt });

describe("boost lanes", () => {
  describe("laneEntries", () => {
    it("gives each stacked boost its own time, not the time until its end", () => {
      // 7 days, then 5 days stacked behind: the second owns 5 days, not 12.
      expect(
        laneEntries(
          [lane("b", at(12 * DAY), 5), lane("a", at(7 * DAY), 7)],
          NOW,
        ),
      ).toEqual([
        { id: "a", ownMs: 7 * DAY },
        { id: "b", ownMs: 5 * DAY },
      ]);
    });

    it("counts the running boost from now", () => {
      expect(laneEntries([lane("a", at(5 * DAY), 7)], NOW)).toEqual([
        { id: "a", ownMs: 5 * DAY },
      ]);
    });

    it("leaves out boosts whose end has passed", () => {
      expect(
        laneEntries([lane("old", at(-HOUR)), lane("now", at(0))], NOW),
      ).toEqual([]);
    });

    it("caps a gap left by an old pause at the bought days", () => {
      // An old pause of the first boost left the 5-day one ending at +12
      // days although nothing runs before it: it still owns only 5 days.
      expect(laneEntries([lane("b", at(12 * DAY), 5)], NOW)).toEqual([
        { id: "b", ownMs: 5 * DAY },
      ]);
    });

    it("keeps an overlap from an old extension at what the listing shows", () => {
      // The first boost was extended past the start of the second: the second
      // owns only what is left after the first, the listing still ends at +12.
      const entries = laneEntries(
        [lane("a", at(10 * DAY), 10), lane("b", at(12 * DAY), 5)],
        NOW,
      );
      expect(entries).toEqual([
        { id: "a", ownMs: 10 * DAY },
        { id: "b", ownMs: 2 * DAY },
      ]);
      expect(layLane(entries, NOW).tail).toEqual(at(12 * DAY));
    });

    it("orders equal ends by activation, then by id", () => {
      const end = at(DAY);
      expect(
        laneEntries(
          [
            lane("z", end, 30, at(-HOUR)),
            lane("y", end, 30, at(-2 * HOUR)),
            lane("x", end, 30, at(-HOUR)),
          ],
          NOW,
        ).map((e) => e.id),
      ).toEqual(["y", "x", "z"]);
    });
  });

  describe("layLane", () => {
    it("lays the boosts end to end from now", () => {
      const { ends, tail } = layLane(
        [
          { id: "a", ownMs: 2 * DAY },
          { id: "b", ownMs: 3 * DAY },
        ],
        NOW,
      );
      expect(ends.get("a")).toEqual(at(2 * DAY));
      expect(ends.get("b")).toEqual(at(5 * DAY));
      expect(tail).toEqual(at(5 * DAY));
    });

    it("has no tail when empty", () => {
      expect(layLane([], NOW)).toEqual({ ends: new Map(), tail: null });
    });

    it("is the identity on a queue it laid itself", () => {
      const entries = [
        { id: "a", ownMs: 2 * DAY },
        { id: "b", ownMs: 3 * DAY },
      ];
      const { ends } = layLane(entries, NOW);
      const again = laneEntries(
        entries.map((e) => lane(e.id, ends.get(e.id)!)),
        NOW,
      );
      expect(again).toEqual(entries);
    });
  });

  describe("boostShowcaseEnd", () => {
    const row = (over: Partial<Parameters<typeof boostShowcaseEnd>[0]>) => ({
      showcaseOnHome: true,
      showcaseEndsAt: null,
      endsAt: at(33 * DAY),
      ...over,
    });

    it("is null for a search-only boost", () => {
      expect(boostShowcaseEnd(row({ showcaseOnHome: false }), at(DAY))).toBe(
        null,
      );
    });

    it("is the boost's own showcase end", () => {
      expect(
        boostShowcaseEnd(row({ showcaseEndsAt: at(3 * DAY) }), null),
      ).toEqual(at(3 * DAY));
    });

    it("reads the listing's showcase end for a row written before the column", () => {
      expect(boostShowcaseEnd(row({}), at(3 * DAY))).toEqual(at(3 * DAY));
    });

    it("never runs past the boost's own end", () => {
      expect(
        boostShowcaseEnd(
          row({ endsAt: at(DAY), showcaseEndsAt: at(3 * DAY) }),
          null,
        ),
      ).toEqual(at(DAY));
      expect(boostShowcaseEnd(row({ endsAt: at(DAY) }), at(3 * DAY))).toEqual(
        at(DAY),
      );
    });
  });

  it("caps at bought plus extended days and rounds seconds up", () => {
    expect(boostCapMs({ durationDays: 7, extendedDays: 2 })).toBe(9 * DAY);
    expect(ceilSeconds(1500)).toBe(2);
    expect(ceilSeconds(-5)).toBe(0);
  });
});
