import { describe, expect, it } from "vitest";
import { getMessages } from "@tarodan/i18n";
import {
  simulationKindKey,
  simulationLegKey,
  simulationRowId,
  simulationStepKey,
} from "./simulation";

/** Anahtar her iki katalogda gerçekten var mı (dinamik anahtar yazım hatası yakalanır). */
const resolves = (key: string): boolean =>
  (["tr", "en"] as const).every(
    (locale) =>
      typeof key
        .split(".")
        .reduce<unknown>(
          (node, part) =>
            node && typeof node === "object"
              ? (node as Record<string, unknown>)[part]
              : undefined,
          getMessages(locale),
        ) === "string",
  );

describe("simulation labels", () => {
  it("every kind × step label exists in the catalog", () => {
    for (const kind of [
      "order_shipment",
      "refund_return",
      "trade_shipment",
    ] as const) {
      expect(resolves(simulationKindKey(kind))).toBe(true);
      for (const step of ["picked_up", "delivered"] as const) {
        expect(resolves(simulationStepKey(kind, step))).toBe(true);
      }
    }
  });

  it("a return parcel's delivery reads as delivered to the seller", () => {
    expect(simulationStepKey("refund_return", "delivered")).toBe(
      "admin.system.testTools.simulation.steps.refund_return.delivered",
    );
  });

  it("labels known trade legs and ignores the rest", () => {
    expect(resolves(simulationLegKey("to_warehouse") ?? "")).toBe(true);
    expect(resolves(simulationLegKey("from_warehouse") ?? "")).toBe(true);
    expect(resolves(simulationLegKey("return") ?? "")).toBe(true);
    expect(simulationLegKey(null)).toBeNull();
    expect(simulationLegKey("sideways")).toBeNull();
  });

  it("row id is unique across the three source tables", () => {
    expect(simulationRowId({ kind: "refund_return", id: "x" })).toBe(
      "refund_return:x",
    );
    expect(simulationRowId({ kind: "trade_shipment", id: "x" })).not.toBe(
      simulationRowId({ kind: "refund_return", id: "x" }),
    );
  });
});
