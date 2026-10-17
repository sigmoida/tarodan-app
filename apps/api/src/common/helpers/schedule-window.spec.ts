import { scheduleWindowWhere, withinScheduleWindow } from "./schedule-window";
import {
  BEACON_DEDUPE_SECONDS,
  BEACON_TRACKING_THROTTLE,
} from "./beacon-tracking";
import { clientIpThrottleTracker } from "./client-ip";

const NOW = new Date("2026-10-12T12:00:00Z");
const before = new Date("2026-10-12T11:59:59Z");
const after = new Date("2026-10-12T12:00:01Z");

describe("withinScheduleWindow", () => {
  it.each([
    ["iki uç da boş (sınırsız)", null, null, true],
    ["başlangıç geçmişte", before, null, true],
    ["bitiş gelecekte", null, after, true],
    ["başlangıç anında (dahil)", NOW, null, true],
    ["bitiş anında (dahil)", null, NOW, true],
    ["henüz başlamadı", after, null, false],
    ["bitti", null, before, false],
  ])("%s → %s", (_d, start, end, expected) => {
    expect(withinScheduleWindow(NOW, start, end)).toBe(expected);
  });
});

describe("scheduleWindowWhere", () => {
  it("iki ucu da null = sınırsız kabul ederek süzer", () => {
    expect(scheduleWindowWhere(NOW)).toEqual([
      { OR: [{ startDate: null }, { startDate: { lte: NOW } }] },
      { OR: [{ endDate: null }, { endDate: { gte: NOW } }] },
    ]);
  });
});

describe("beacon tracking (reklam + hero ortak tanım)", () => {
  it("gösterim 30 dk, tık 10 sn tekilleşir", () => {
    expect(BEACON_DEDUPE_SECONDS).toEqual({ impression: 1800, click: 10 });
  });

  it("istemci IP'si başına 60/dk kısılır", () => {
    expect(BEACON_TRACKING_THROTTLE.default).toEqual({
      limit: 60,
      ttl: 60_000,
      getTracker: clientIpThrottleTracker,
    });
  });
});
