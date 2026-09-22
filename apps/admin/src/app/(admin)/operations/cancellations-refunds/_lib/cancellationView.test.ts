import { describe, expect, it } from "vitest";
import type {
  AdminCancellationInfo,
  AdminCancellationRow,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";
import {
  cancellationActorLabel,
  cancellationDetailHref,
  cancellationReasonLabel,
  cancellationStatusKey,
  isPartialCancellation,
  refundStateVariant,
} from "./cancellationView";

/** Anahtarı köşeli parantezle döndürür: testte etiketin kaynağı görünür. */
const t = ((key: string) => `[${key}]`) as unknown as Translate;

const info = (
  overrides: Partial<AdminCancellationInfo> = {},
): AdminCancellationInfo => ({
  cancelledAt: "2026-09-21T10:00:00.000Z",
  cancelledBy: "buyer",
  reason: { kind: "none" },
  refundState: "pending",
  ...overrides,
});

const row = (overrides: Partial<AdminCancellationRow>) =>
  ({
    id: "g1",
    detailOrderId: "o1",
    tradeId: null,
    lineCounts: { cancelled: 1, total: 1 },
    ...overrides,
  }) as AdminCancellationRow;

describe("cancellationReasonLabel", () => {
  it("labels the buyer's code with the storefront's cancellation reason key", () => {
    expect(
      cancellationReasonLabel(
        info({ reason: { kind: "code", code: "wrong_card" } }),
        t,
      ),
    ).toBe("[status.orderCancellationReason.wrong_card]");
  });

  it("shows system expiries as Süresi Dolan", () => {
    expect(
      cancellationReasonLabel(info({ reason: { kind: "expired" } }), t),
    ).toBe("[admin.operations.cancellations.reason.expired]");
  });

  it("shows free text as is, and a dash when there is nothing", () => {
    expect(
      cancellationReasonLabel(
        info({ reason: { kind: "text", text: "Stok tükendi" } }),
        t,
      ),
    ).toBe("Stok tükendi");
    expect(cancellationReasonLabel(info({ reason: { kind: "none" } }), t)).toBe(
      "—",
    );
    expect(cancellationReasonLabel(undefined, t)).toBe("—");
  });
});

describe("cancellationActorLabel", () => {
  it("labels every actor, and an unstamped one as Bilinmiyor", () => {
    expect(cancellationActorLabel("buyer", t)).toBe(
      "[admin.operations.cancellations.actor.buyer]",
    );
    expect(cancellationActorLabel("system", t)).toBe(
      "[admin.operations.cancellations.actor.system]",
    );
    expect(cancellationActorLabel(null, t)).toBe(
      "[admin.operations.cancellations.actor.unknown]",
    );
  });
});

describe("row helpers", () => {
  it("opens the trade file for a trade, the order file otherwise", () => {
    expect(cancellationDetailHref(row({ kind: "trade", tradeId: "t1" }))).toBe(
      "/operations/trades/t1",
    );
    expect(cancellationDetailHref(row({ kind: "group" }))).toBe(
      "/operations/orders/o1",
    );
  });

  it("flags a cart with uncancelled lines as partial", () => {
    expect(
      isPartialCancellation(row({ lineCounts: { cancelled: 1, total: 3 } })),
    ).toBe(true);
    expect(
      isPartialCancellation(row({ lineCounts: { cancelled: 2, total: 2 } })),
    ).toBe(false);
  });

  it("tones the refund state: done green, failed red, waiting amber", () => {
    expect(refundStateVariant("refunded")).toBe("success");
    expect(refundStateVariant("failed")).toBe("danger");
    expect(refundStateVariant("pending")).toBe("warning");
    expect(refundStateVariant("in_review")).toBe("info");
    expect(refundStateVariant("not_charged")).toBe("default");
  });

  it("maps row statuses to catalog keys, unknown ones to cancelled", () => {
    expect(cancellationStatusKey("rejected")).toBe(
      "admin.operations.cancellations.status.rejected",
    );
    expect(cancellationStatusKey("weird")).toBe(
      "admin.operations.cancellations.status.cancelled",
    );
  });
});
