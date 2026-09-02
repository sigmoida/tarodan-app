import { ShipmentStatus } from "@prisma/client";
import {
  canTransitionShipmentStatus,
  isTerminalShipmentStatus,
} from "./shipment-state-machine";

const S = ShipmentStatus;

describe("shipment-state-machine (#86)", () => {
  describe("canTransitionShipmentStatus", () => {
    it("allows idempotent same-status (replayed carrier event / re-poll)", () => {
      for (const s of Object.values(S)) {
        expect(canTransitionShipmentStatus(s, s)).toBe(true);
      }
    });

    it("rejects the money-critical regression delivered → picked_up", () => {
      expect(canTransitionShipmentStatus(S.delivered, S.picked_up)).toBe(false);
      expect(canTransitionShipmentStatus(S.delivered, S.in_transit)).toBe(
        false,
      );
      expect(canTransitionShipmentStatus(S.delivered, S.out_for_delivery)).toBe(
        false,
      );
    });

    it("allows delivered → the post-delivery return legs only", () => {
      expect(
        canTransitionShipmentStatus(S.delivered, S.return_in_progress),
      ).toBe(true);
      expect(canTransitionShipmentStatus(S.delivered, S.returned)).toBe(true);
    });

    it("lets a return-flagged parcel still be delivered (Sürat's transient code 9)", () => {
      // PKG-2HGNFGEGTD: bayraksız kod 9 → return_in_progress, ertesi gün kod 6.
      // Bu geçiş kapalıyken koli sonsuza dek kilitlendi; admin override da aynı
      // grafiği kullandığı için kodsuz kurtarma yoktu.
      expect(
        canTransitionShipmentStatus(S.return_in_progress, S.delivered),
      ).toBe(true);
      expect(
        canTransitionShipmentStatus(S.return_in_progress, S.returned),
      ).toBe(true);
      expect(
        canTransitionShipmentStatus(S.return_in_progress, S.in_transit),
      ).toBe(false);
    });

    it("lets the carrier cancel a parcel from any non-terminal state", () => {
      // PKG-ANSXZR4QFC: "Gönderi iptal edilmiştir" picked_up'ta 13 gün yutuldu.
      for (const from of [
        S.picked_up,
        S.in_transit,
        S.at_delivery_branch,
        S.out_for_delivery,
        S.failed,
        S.return_in_progress,
      ]) {
        expect(canTransitionShipmentStatus(from, S.cancelled)).toBe(true);
      }
      // Para akmış terminal satırlar iptale geri sarılamaz.
      expect(canTransitionShipmentStatus(S.delivered, S.cancelled)).toBe(false);
      expect(canTransitionShipmentStatus(S.returned, S.cancelled)).toBe(false);
    });

    it("locks returned / cancelled as fully terminal", () => {
      for (const to of Object.values(S)) {
        if (to === S.returned) continue;
        expect(canTransitionShipmentStatus(S.returned, to)).toBe(false);
      }
      for (const to of Object.values(S)) {
        if (to === S.cancelled) continue;
        expect(canTransitionShipmentStatus(S.cancelled, to)).toBe(false);
      }
    });

    it("does NOT block legitimate in-transit sequences (incl. re-attempt)", () => {
      // forward
      expect(canTransitionShipmentStatus(S.picked_up, S.in_transit)).toBe(true);
      expect(
        canTransitionShipmentStatus(S.in_transit, S.out_for_delivery),
      ).toBe(true);
      expect(canTransitionShipmentStatus(S.out_for_delivery, S.delivered)).toBe(
        true,
      );
      // failed delivery attempt returns to branch — must stay allowed
      expect(
        canTransitionShipmentStatus(S.out_for_delivery, S.at_delivery_branch),
      ).toBe(true);
      // branch / fail / return from a non-terminal state
      expect(canTransitionShipmentStatus(S.in_transit, S.failed)).toBe(true);
      expect(
        canTransitionShipmentStatus(S.picked_up, S.return_in_progress),
      ).toBe(true);
    });
  });

  describe("isTerminalShipmentStatus", () => {
    it("flags delivered / returned / cancelled as terminal", () => {
      expect(isTerminalShipmentStatus(S.delivered)).toBe(true);
      expect(isTerminalShipmentStatus(S.returned)).toBe(true);
      expect(isTerminalShipmentStatus(S.cancelled)).toBe(true);
    });
    it("non-terminal statuses are not terminal", () => {
      expect(isTerminalShipmentStatus(S.in_transit)).toBe(false);
      expect(isTerminalShipmentStatus(S.picked_up)).toBe(false);
      expect(isTerminalShipmentStatus(S.failed)).toBe(false);
    });
  });
});
