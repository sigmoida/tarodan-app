import { BadRequestException } from "@nestjs/common";
import { AdminAdPackageService } from "./admin-ad-package.service";

describe("AdminAdPackageService audience targets", () => {
  const service = new AdminAdPackageService({} as any);
  const normalize = (
    mode: "everyone" | "membership_tiers" | "specific_users" | "tiers_or_users",
    tiers: Array<"free" | "basic" | "premium" | "business"> = [],
    users: string[] = [],
  ) => (service as any).normalizeAudienceTargets(mode, tiers, users);

  it("clears irrelevant targets for an everyone package", () => {
    expect(normalize("everyone", ["premium"], ["user-1"])).toEqual({
      targetTierTypes: [],
      targetUserIds: [],
    });
  });

  it("deduplicates the selected targets", () => {
    expect(
      normalize("tiers_or_users", ["premium", "premium"], ["user-1", "user-1"]),
    ).toEqual({
      targetTierTypes: ["premium"],
      targetUserIds: ["user-1"],
    });
  });

  it.each([
    ["membership_tiers", [], []],
    ["specific_users", [], []],
    ["tiers_or_users", [], []],
  ] as const)("rejects an empty %s audience", (mode, tiers, users) => {
    expect(() => normalize(mode, [...tiers], [...users])).toThrow(
      BadRequestException,
    );
  });
});
