/** @format */

"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { tradesApi, addressesApi, paymentsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useConfirm } from "@/components/ConfirmProvider";
import type { Trade } from "../_lib/types";

interface UseTradeActionsArgs {
  trade: Trade | null;
  invalidateTrade: () => Promise<unknown>;
  needToShip: unknown;
}

/**
 * Every write action on a trade — cash payment (incl. the PayTR bypass flow),
 * ship, confirm-receipt, accept, reject, cancel — as mutations that each own
 * their toast + invalidation, plus the ship-address query/state, the accept
 * delivery-address state, and the reject-modal state. `counter` lives in the
 * counter-offer editor hook.
 */
export function useTradeActions({
  trade,
  invalidateTrade,
  needToShip,
}: UseTradeActionsArgs) {
  const router = useRouter();
  const confirm = useConfirm();
  const t = useTranslations();

  const [tradeAddressId, setTradeAddressId] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [shipAddressId, setShipAddressId] = useState("");

  const addressesQuery = useQuery({
    queryKey: queryKeys.addresses.all(),
    queryFn: async () => {
      const res = await addressesApi.getAll();
      const list = res.data?.data ?? res.data?.addresses ?? res.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: !!needToShip,
    meta: { page: "trade-ship-addresses" },
  });
  const addresses = useMemo(
    () => addressesQuery.data ?? [],
    [addressesQuery.data],
  );

  useEffect(() => {
    if (addresses.length > 0 && !shipAddressId) {
      setShipAddressId(addresses[0].id);
    }
  }, [addresses, shipAddressId]);

  // --- Mutations -----------------------------------------------------------

  const cashPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!trade) return;
      const res = await paymentsApi.initiateTradeCash(trade.id);
      const data = res.data?.data ?? res.data;

      if (data?.useBypass && data?.paymentId) {
        try {
          const bypassRes = await paymentsApi.bypassComplete(
            data.paymentId as string,
          );
          if (bypassRes.data?.success) {
            toast.success(t("payment.paymentSuccess"));
            await invalidateTrade();
            // Trade cash payment → direkt takas sayfasına dön, /orders'a uğrama
            router.push(`/profile/trades/${trade.id}?paid=1`);
            return;
          }
        } catch {
          toast.error(t("trade.bypassPaymentFailed"));
        }
        return;
      }

      // Tek ödeme yüzeyi: site-içi kart formu + 3D Secure için ödeme sayfamıza git.
      if (data?.paymentId) {
        router.push(`/payment/${data.paymentId}`);
        return;
      }

      toast.error(t("payment.startFailed"));
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || t("payment.startFailed"));
    },
  });

  const handleCashPayment = () => {
    if (!trade) return;
    cashPaymentMutation.mutate();
  };

  const shipMutation = useMutation({
    mutationFn: (fromAddressId: string) => {
      if (!trade) throw new Error("no trade");
      return tradesApi.ship(trade.id, { fromAddressId, carrier: "surat" });
    },
    onSuccess: async () => {
      toast.success(t("trade.shipInfoSubmitted"));
      setShipAddressId("");
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to submit shipping:", error);
      toast.error(
        error.response?.data?.message || t("trade.shipInfoSubmitFailed"),
      );
    },
  });

  const handleShipSubmit = () => {
    if (!trade || !shipAddressId) {
      toast.error(t("trade.selectAddress"));
      return;
    }
    shipMutation.mutate(shipAddressId);
  };

  const confirmReceiptMutation = useMutation({
    mutationFn: () => {
      if (!trade) throw new Error("no trade");
      return tradesApi.confirmReceipt(trade.id);
    },
    onSuccess: async () => {
      toast.success(t("trade.receiptConfirmed"));
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to confirm receipt:", error);
      toast.error(
        error.response?.data?.message || t("trade.confirmReceiptFailed"),
      );
    },
  });

  const handleConfirmReceipt = () => {
    if (!trade) return;
    confirmReceiptMutation.mutate();
  };

  const acceptMutation = useMutation({
    mutationFn: (addressId: string) => {
      if (!trade) throw new Error("no trade");
      return tradesApi.accept(trade.id, undefined, addressId);
    },
    onSuccess: async () => {
      toast.success(t("product.tradeAccepted"));
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to accept trade:", error);
      toast.error(error.response?.data?.message || t("trade.acceptFailed"), {
        id: "trade-action-error",
      });
    },
  });

  const handleAccept = () => {
    if (!trade) return;
    if (!tradeAddressId) {
      toast.error(t("trade.selectDeliveryAddress"), {
        id: "trade-address-required",
      });
      return;
    }
    acceptMutation.mutate(tradeAddressId);
  };

  const rejectMutation = useMutation({
    mutationFn: () => {
      if (!trade) throw new Error("no trade");
      return tradesApi.reject(trade.id, rejectReason.trim() || undefined);
    },
    onSuccess: async () => {
      toast.success(t("trade.tradeRejected"));
      setShowRejectModal(false);
      setRejectReason("");
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to reject trade:", error);
      toast.error(error.response?.data?.message || t("trade.rejectFailed"));
    },
  });

  const handleReject = () => {
    if (!trade) return;
    rejectMutation.mutate();
  };

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!trade) throw new Error("no trade");
      return tradesApi.cancel(trade.id, t("trade.cancelledByUser"));
    },
    onSuccess: async () => {
      toast.success(t("trade.tradeCancelled"));
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to cancel trade:", error);
      toast.error(error.response?.data?.message || t("trade.cancelFailed"));
    },
  });

  const handleCancel = async () => {
    if (!trade) return;

    if (
      !(await confirm({
        title: t("trade.cancelConfirmTitle"),
        description: t("trade.cancelConfirmDesc"),
        confirmLabel: t("order.cancelConfirmYes"),
        cancelLabel: t("order.cancelConfirmNo"),
        destructive: true,
      }))
    ) {
      return;
    }

    cancelMutation.mutate();
  };

  const isActionLoading =
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    cancelMutation.isPending ||
    shipMutation.isPending ||
    confirmReceiptMutation.isPending;
  const cashPaymentLoading = cashPaymentMutation.isPending;

  return {
    // addresses + ship form
    addresses,
    addressesLoading: addressesQuery.isLoading,
    shipAddressId,
    setShipAddressId,
    // action state
    isActionLoading,
    cashPaymentLoading,
    tradeAddressId,
    setTradeAddressId,
    showRejectModal,
    setShowRejectModal,
    rejectReason,
    setRejectReason,
    // handlers
    handleCashPayment,
    handleShipSubmit,
    handleConfirmReceipt,
    handleAccept,
    handleReject,
    handleCancel,
  };
}
