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
