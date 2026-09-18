import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DashboardStatsQueryDto } from "./analytics.dto";

describe("DashboardStatsQueryDto", () => {
  const failing = async (query: Record<string, string>) =>
    (await validate(plainToInstance(DashboardStatsQueryDto, query)))
      .map((error) => error.property)
      .sort();

  it("defaults to the daily period", () => {
    expect(plainToInstance(DashboardStatsQueryDto, {}).period).toBe("daily");
  });

  it("accepts the daily and monthly periods without a range", async () => {
    expect(await failing({ period: "daily" })).toEqual([]);
    expect(await failing({ period: "monthly" })).toEqual([]);
  });

  it("rejects an unknown period", async () => {
    expect(await failing({ period: "weekly" })).toEqual(["period"]);
  });

  it("accepts a custom period with a well-formed range", async () => {
    expect(
      await failing({ period: "custom", from: "2026-06-01", to: "2026-06-30" }),
    ).toEqual([]);
  });

  it("rejects a custom period missing an end", async () => {
    expect(await failing({ period: "custom", from: "2026-06-01" })).toEqual([
      "period",
    ]);
  });

  it("rejects a reversed custom range", async () => {
    expect(
      await failing({ period: "custom", from: "2026-06-30", to: "2026-06-01" }),
    ).toEqual(["period"]);
  });

  it("rejects a malformed date", async () => {
    expect(
      await failing({ period: "custom", from: "yesterday", to: "2026-06-01" }),
    ).toEqual(["from", "period"]);
  });
});
