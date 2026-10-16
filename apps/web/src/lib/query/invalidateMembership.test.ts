/** @format */

import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateMembershipQueries } from "./invalidateMembership";
import { queryKeys } from "./keys";

describe("invalidateMembershipQueries", () => {
  it("me ve limits sorgularını birlikte tazeler (isAdFree katmandan gelir)", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateMembershipQueries({
      invalidateQueries,
    } as unknown as QueryClient);

    const keys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(keys).toEqual([
      queryKeys.membership.me(),
      queryKeys.membership.limits(),
    ]);
  });
});
