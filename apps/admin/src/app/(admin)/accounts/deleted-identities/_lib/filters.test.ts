import { describe, expect, it } from "vitest";
import { filterDefaults } from "@/components/list/filters/schema";
import type { TranslateFn } from "@/components/list/filters/types";
import { listFilterParams } from "@/hooks/useAdminResource";
import { deletedIdentityFilterFields } from "./filters";

const t = ((key: string) => key) as unknown as TranslateFn;

describe("deletedIdentityFilterFields", () => {
  const fields = deletedIdentityFilterFields(t);

  it("liste hiçbir filtre uygulanmadan açılır (hepsi nötr 'all')", () => {
    const defaults = filterDefaults(fields);

    expect(defaults.source).toBe("all");
    expect(defaults.wasSeller).toBe("all");
    expect(defaults.retentionExpired).toBe("all");
  });

  it("açılış varsayılanları API'ye hiçbir süzgeç olarak gitmez", () => {
    expect(listFilterParams("", filterDefaults(fields))).toEqual({});
  });

  it("her seçim filtresinde nötr seçenek ilk sıradadır, gerçek değerler korunur", () => {
    const selectValues = fields.flatMap((field) =>
      field.type === "select" ? [field.options.map((o) => o.value)] : [],
    );

    expect(selectValues).toEqual([
      ["all", "live", "backfill"],
      ["all", "true", "false"],
      ["all", "true", "false"],
    ]);
  });
});
