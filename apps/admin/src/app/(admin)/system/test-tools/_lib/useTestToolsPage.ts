"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { type TestEnv } from "./types";

export function useTestToolsPage() {
  return useQuery<TestEnv>({
    queryKey: adminKeys.all("test-tools-env"),
    queryFn: async () =>
      (await adminApi.get("/admin/test-tools/environment")).data,
  });
}
