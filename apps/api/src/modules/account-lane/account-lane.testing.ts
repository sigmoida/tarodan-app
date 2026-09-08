import { ForbiddenException } from "@nestjs/common";
import type { AccountLane } from "./account-lane";

/**
 * Spec'ler için AccountLaneService taklidi: `laneOfUser` kullanıcı→şerit
 * haritasından okur (bilinmeyen/anonim = live); `lanesDiffer`/`assertSameLane`
 * gerçek servisle aynı kuralı bundan türetir.
 */
export function accountLaneServiceStub(
  lanesByUser: Record<string, AccountLane> = {},
) {
  const laneOf = async (id?: string | null): Promise<AccountLane> =>
    id ? (lanesByUser[id] ?? "live") : "live";
  const differ = async (a?: string | null, b?: string | null) =>
    (await laneOf(a)) !== (await laneOf(b));
  return {
    laneOfUser: jest.fn(laneOf),
    isTestLane: jest.fn(
      async (id?: string | null) => (await laneOf(id)) === "test",
    ),
    lanesDiffer: jest.fn(differ),
    assertSameLane: jest.fn(async (a?: string | null, b?: string | null) => {
      if (await differ(a, b)) throw new ForbiddenException("lane mismatch");
    }),
    invalidate: jest.fn().mockResolvedValue(undefined),
  };
}
