/** @format */

"use client";

import type { useAuthStore } from "@/stores/authStore";
import type { Trade, TradeShipment } from "../_lib/types";

type TradeUser = ReturnType<typeof useAuthStore.getState>["user"];

/**
 * Pure derivation of the escrow shipment slots (my/other to- and
 * from-warehouse legs plus the return leg) from the loaded trade and the
 * current user.
 */
export function useTradeShipments(trade: Trade | null, user: TradeUser) {
  const shipments: TradeShipment[] = trade?.shipments ?? [];

  const myToWarehouseShipment = user
    ? shipments.find(
        (s) => s.direction === "to_warehouse" && s.senderUserId === user.id,
      )
    : undefined;
  const otherToWarehouseShipment =
    user && trade
      ? shipments.find(
          (s) =>
            s.direction === "to_warehouse" &&
            s.senderUserId &&
            s.senderUserId !== user.id,
        )
      : undefined;
  const myFromWarehouseShipment = user
    ? shipments.find(
        (s) =>
          s.direction === "from_warehouse" && s.recipientUserId === user.id,
      )
    : undefined;
  const otherFromWarehouseShipment =
    user && trade
      ? shipments.find(
          (s) =>
            s.direction === "from_warehouse" &&
            s.recipientUserId &&
            s.recipientUserId !== user.id,
        )
      : undefined;
  const myReturnShipment = user
    ? shipments.find(
        (s) => s.direction === "return" && s.recipientUserId === user.id,
      )
    : undefined;

  return {
    myToWarehouseShipment,
    otherToWarehouseShipment,
    myFromWarehouseShipment,
    otherFromWarehouseShipment,
    myReturnShipment,
  };
}
