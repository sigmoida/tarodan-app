/** @format */

"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";
import {
  tradesApi,
  listingsApi,
  userApi,
  addressesApi,
  paymentsApi,
} from "@/lib/api";
import { useTranslation } from "@/i18n";
import { useConfirm } from "@/components/ConfirmProvider";
import { getTradeStatusMeta } from "../_lib/types";
import type { Trade, TradeItem, TradeShipment } from "../_lib/types";

/**
 * Everything the trade-detail screen needs: the trade + addresses queries, all
 * write actions as mutations (ship / confirm-receipt / accept / reject / cancel
 * / counter / cash-payment), the countdown timer, the counter-offer edit-mode
 * state, and every derived flag of the two-party escrow state machine. Each
 * mutation owns its toast + query invalidation; the page and sections stay thin.
 */
export function useTradeDetail() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { t, locale } = useTranslation();
  const confirm = useConfirm();
  const tradeId = params.id as string;
  const TRADE_STATUS_META = getTradeStatusMeta(locale);

  const [tradeAddressId, setTradeAddressId] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [countdown, setCountdown] = useState<string | null>(null);
  const [isCounterMode, setIsCounterMode] = useState(false);
  const [counterProducts, setCounterProducts] = useState<any[]>([]);
  const [counterTargetProducts, setCounterTargetProducts] = useState<any[]>([]);
  const [selectedCounterProducts, setSelectedCounterProducts] = useState<
    string[]
  >([]);
  const [selectedCounterTargetProducts, setSelectedCounterTargetProducts] =
    useState<string[]>([]);
  const [counterCashAmount, setCounterCashAmount] = useState<string>("");
  const [counterCashPayer, setCounterCashPayer] = useState<"me" | "them">("me");
  const [counterMessage, setCounterMessage] = useState("");
  const [isLoadingCounterData, setIsLoadingCounterData] = useState(false);
  const [shipAddressId, setShipAddressId] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      toast.error(
        locale === "en"
          ? "Please login to view trade details"
          : "Takas detaylarını görmek için giriş yapmalısınız",
      );
      router.push(`/login?redirect=/profile/trades/${tradeId}`);
    }
  }, [isAuthenticated, authLoading, locale, router, tradeId]);

  const tradeQuery = useQuery({
    queryKey: ["trade", tradeId],
    queryFn: async (): Promise<Trade> => {
      const response = await tradesApi.getOne(tradeId);
      return response.data.trade || response.data;
    },
    enabled: !!tradeId && !authLoading && isAuthenticated,
    meta: { page: "trade-detail" },
    retry: false,
  });
  const trade = tradeQuery.data ?? null;
  const isLoading =
    authLoading ||
    tradeQuery.isLoading ||
    tradeQuery.isFetching ||
    (!!tradeId && isAuthenticated && tradeQuery.isPending);
  useEffect(() => {
    if (tradeQuery.isError && tradeId) {
      toast.error(
        locale === "en" ? "Failed to load trade" : "Takas yüklenemedi",
      );
      router.push("/profile/trades");
    }
  }, [tradeQuery.isError, tradeId, locale, router]);

  const invalidateTrade = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["trade", tradeId] }),
      queryClient.invalidateQueries({ queryKey: ["trades"] }),
    ]);

  const cashPaymentPending =
    trade?.cashAmount &&
    trade.cashAmount > 0 &&
    trade?.cashPayment?.status !== "completed";
  const isCashPayer = !!(trade && user && trade.cashPayerId === user.id);

  const needToShip =
    trade &&
    user &&
    !cashPaymentPending &&
    ((user.id === trade.initiatorId &&
      !trade.initiatorShipment &&
      (trade.status === "accepted" || trade.status === "receiver_shipped")) ||
      (user.id === trade.receiverId &&
        !trade.receiverShipment &&
        (trade.status === "accepted" || trade.status === "initiator_shipped")));

  // Shipments for the safe-trade (escrow) flow
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

  const addressesQuery = useQuery({
    queryKey: ["addresses"],
    queryFn: async () => {
      const res = await addressesApi.getAll();
      const list = res.data?.data ?? res.data?.addresses ?? res.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: !!needToShip,
    meta: { page: "trade-ship-addresses" },
  });
  const addresses = addressesQuery.data ?? [];

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
            toast.success(
              locale === "en" ? "Payment successful" : "Ödeme başarılı",
            );
            await invalidateTrade();
            // Trade cash payment → direkt takas sayfasına dön, /orders'a uğrama
            router.push(`/profile/trades/${trade.id}?paid=1`);
            return;
          }
        } catch {
          toast.error(
            locale === "en"
              ? "Bypass payment failed"
              : "Test ödemesi tamamlanamadı",
          );
        }
        return;
      }

      // Tek ödeme yüzeyi: site-içi kart formu + 3D Secure için ödeme sayfamıza git.
      if (data?.paymentId) {
        router.push(`/payment/${data.paymentId}`);
        return;
      }

      toast.error(
        locale === "en" ? "Could not start payment" : "Ödeme başlatılamadı",
      );
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.message ||
          (locale === "en"
            ? "Payment initiation failed"
            : "Ödeme başlatılamadı"),
      );
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
      toast.success(
        locale === "en" ? "Shipping info submitted" : "Kargo bilgisi gönderildi",
      );
      setShipAddressId("");
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to submit shipping:", error);
      toast.error(
        error.response?.data?.message ||
          (locale === "en"
            ? "Failed to submit shipping"
            : "Kargo bilgisi gönderilemedi"),
      );
    },
  });

  const handleShipSubmit = () => {
    if (!trade || !shipAddressId) {
      toast.error(
        locale === "en" ? "Please select an address" : "Lütfen adres seçin",
      );
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
      toast.success(
        locale === "en" ? "Receipt confirmed" : "Teslim alındı olarak işaretlendi",
      );
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to confirm receipt:", error);
      toast.error(
        error.response?.data?.message ||
          (locale === "en"
            ? "Failed to confirm receipt"
            : "Teslim alındı işaretlenemedi"),
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
      toast.success(
        locale === "en" ? "Trade accepted!" : "Takas kabul edildi!",
      );
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to accept trade:", error);
      toast.error(
        error.response?.data?.message ||
          (locale === "en"
            ? "Failed to accept trade"
            : "Takas kabul edilemedi"),
        { id: "trade-action-error" },
      );
    },
  });

  const handleAccept = () => {
    if (!trade) return;
    if (!tradeAddressId) {
      toast.error(
        locale === "en"
          ? "Please select or add a delivery address"
          : "Lütfen bir teslimat adresi seçin veya ekleyin",
        { id: "trade-address-required" },
      );
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
      toast.success(locale === "en" ? "Trade rejected" : "Takas reddedildi");
      setShowRejectModal(false);
      setRejectReason("");
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to reject trade:", error);
      toast.error(
        error.response?.data?.message ||
          (locale === "en" ? "Failed to reject trade" : "Takas reddedilemedi"),
      );
    },
  });

  const handleReject = () => {
    if (!trade) return;
    rejectMutation.mutate();
  };

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!trade) throw new Error("no trade");
      return tradesApi.cancel(
        trade.id,
        locale === "en"
          ? "Cancelled by user"
          : "Kullanıcı tarafından iptal edildi",
      );
    },
    onSuccess: async () => {
      toast.success(locale === "en" ? "Trade cancelled" : "Takas iptal edildi");
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to cancel trade:", error);
      toast.error(
        error.response?.data?.message ||
          (locale === "en"
            ? "Failed to cancel trade"
            : "Takas iptal edilemedi"),
      );
    },
  });

  const handleCancel = async () => {
    if (!trade) return;

    if (
      !(await confirm({
        title: locale === "en" ? "Cancel trade" : "Takası iptal et",
        description:
          locale === "en"
            ? "Are you sure you want to cancel this trade?"
            : "Bu takası iptal etmek istediğinizden emin misiniz?",
        confirmLabel: locale === "en" ? "Yes, cancel" : "Evet, iptal et",
        cancelLabel: locale === "en" ? "No" : "Vazgeç",
        destructive: true,
      }))
    ) {
      return;
    }

    cancelMutation.mutate();
  };

  const counterMutation = useMutation({
    mutationFn: (data: {
      initiatorItems: Array<{ productId: string; quantity: number }>;
      receiverItems: Array<{ productId: string; quantity: number }>;
      cashAmount?: number;
      message?: string;
    }) => {
      if (!trade) throw new Error("no trade");
      return tradesApi.counter(trade.id, data);
    },
    onSuccess: async () => {
      toast.success(
        locale === "en" ? "Counter offer sent!" : "Karşı teklif gönderildi!",
      );
      setIsCounterMode(false);
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to send counter offer:", error);
      const errorMessage =
        error.response?.data?.message ||
        (locale === "en"
          ? "Failed to send counter offer"
          : "Karşı teklif gönderilemedi");

      // Handle specific error for identical counter-offer
      if (
        errorMessage.includes("Önceki teklif ile aynı") ||
        errorMessage.includes("identical")
      ) {
        toast.error(
          locale === "en"
            ? "This counter-offer is identical to the current trade. Please make changes before submitting."
            : "Önceki teklif ile aynı. Değişiklik yapmadan karşı teklif gönderemezsiniz.",
        );
      } else {
        toast.error(errorMessage);
      }
    },
  });

  const isActionLoading =
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    cancelMutation.isPending ||
    shipMutation.isPending ||
    confirmReceiptMutation.isPending ||
    counterMutation.isPending;
  const cashPaymentLoading = cashPaymentMutation.isPending;

  // Countdown timer effect
  useEffect(() => {
    if (!trade) return;

    // Determine which deadline to show based on status
    let deadline: string | undefined;
    let deadlineLabel: string = "";

    if (trade.status === "pending" && trade.responseDeadline) {
      deadline = trade.responseDeadline;
      deadlineLabel = locale === "en" ? "Response Time" : "Yanıt Süresi";
    } else if (
      (trade.status === "accepted" || trade.status === "awaiting_payment") &&
      trade.paymentDeadline
    ) {
      deadline = trade.paymentDeadline;
      deadlineLabel = locale === "en" ? "Payment Time" : "Ödeme Süresi";
    } else if (
      [
        "initiator_shipped",
        "receiver_shipped",
        "accepted",
        "shipping_to_warehouse",
      ].includes(trade.status) &&
      trade.shippingDeadline
    ) {
      deadline = trade.shippingDeadline;
      deadlineLabel = locale === "en" ? "Shipping Time" : "Kargo Süresi";
    }

    if (!deadline) {
      setCountdown(null);
      return;
    }

    const calculateCountdown = () => {
      const now = new Date().getTime();
      const deadlineTime = new Date(deadline!).getTime();
      const diff = deadlineTime - now;

      if (diff <= 0) {
        setCountdown(
          `${deadlineLabel}: ${locale === "en" ? "Time Expired!" : "Süre Doldu!"}`,
        );
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      );
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      let timeStr = "";
      if (days > 0) timeStr += `${days}${locale === "en" ? "d " : "g "}`;
      timeStr += `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

      setCountdown(`${deadlineLabel}: ${timeStr}`);
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);

    return () => clearInterval(interval);
  }, [trade]);

  // --- Counter-offer edit mode --------------------------------------------

  const handleOpenCounterModal = async () => {
    if (!trade) return;
    setIsCounterMode(true);
    setIsLoadingCounterData(true);

    try {
      // Fetch my products (for counter-offer initiator items)
      const myProductsRes = await userApi.getMyProducts();
      const myProducts =
        myProductsRes.data.data || myProductsRes.data.products || [];
      const tradeableProducts = myProducts.filter(
        (p: any) =>
          p.status === "active" &&
          p.isTradeEnabled &&
          p.id !== trade.initiatorItems[0]?.productId,
      );
      setCounterProducts(tradeableProducts);

      // Fetch original initiator's products (for counter-offer receiver items)
      const originalInitiatorId = trade.initiatorId;

      // Get products that are currently in the trade (these should be shown and pre-selected)
      const currentTradeProductIds = trade.initiatorItems.map(
        (item: TradeItem) => item.productId,
      );

      // Create product objects from trade items (they already have id, title, image)
      const currentTradeProducts = trade.initiatorItems.map(
        (item: TradeItem) => ({
          id: item.productId,
          title: item.productTitle,
          price: item.valueAtTrade, // Use value at trade time
          images: item.productImages?.length
            ? item.productImages
            : item.productImage
              ? [{ cardUrl: item.productImage, detailUrl: item.productImage }]
              : [],
          status: "reserved", // These are in a trade, so they're reserved
          isTradeEnabled: true, // They're already in a trade, so they must be trade-enabled
        }),
      );

      // Get active and trade-enabled products (excluding ones already in current trade to avoid duplicates)
      const activeListingsRes = await listingsApi.getAll({
        sellerId: originalInitiatorId,
        status: "active",
        tradeOnly: true,
        limit: 100,
      });
      const activeProducts =
        activeListingsRes.data.products || activeListingsRes.data.data || [];

      // Filter out products already in current trade
      const otherActiveProducts = activeProducts.filter(
        (p: any) => !currentTradeProductIds.includes(p.id),
      );

      // Combine: current trade products + other active trade-enabled products
      const allInitiatorProducts = [
        ...currentTradeProducts,
        ...otherActiveProducts,
      ];

      // All products should be trade-enabled (current trade products are already in a trade, so include them)
      const tradeableInitiatorProducts = allInitiatorProducts.filter(
        (p: any) => {
          const isInCurrentTrade = currentTradeProductIds.includes(p.id);
          return (
            isInCurrentTrade || (p.isTradeEnabled && p.status === "active")
          );
        },
      );

      setCounterTargetProducts(tradeableInitiatorProducts);

      // Pre-fill form with current trade data (swapped)
      // What receiver currently wants (initiatorItems) -> what receiver will want in counter (selectedCounterTargetProducts)
      setSelectedCounterTargetProducts(
        trade.initiatorItems.map((item: TradeItem) => item.productId),
      );

      // What receiver currently offers (receiverItems) -> what receiver will offer in counter (selectedCounterProducts)
      // Create product objects from receiver items for the list
      const currentReceiverProducts = trade.receiverItems.map(
        (item: TradeItem) => ({
          id: item.productId,
          title: item.productTitle,
          price: item.valueAtTrade,
          images: item.productImages?.length
            ? item.productImages
            : item.productImage
              ? [{ cardUrl: item.productImage, detailUrl: item.productImage }]
              : [],
          status: "reserved",
          isTradeEnabled: true,
        }),
      );

      // Combine current receiver products with other available products
      const allReceiverProducts = [
        ...currentReceiverProducts,
        ...tradeableProducts.filter(
          (p: { id: string }) =>
            !trade.receiverItems.some(
              (item: TradeItem) => item.productId === p.id,
            ),
        ),
      ];
      setCounterProducts(allReceiverProducts);

      // Pre-select current receiver products
      const currentReceiverProductIds = trade.receiverItems.map(
        (item: TradeItem) => item.productId,
      );
      setSelectedCounterProducts(currentReceiverProductIds);

      // Pre-fill cash amount
      if (trade.cashAmount && trade.cashAmount > 0) {
        setCounterCashAmount(trade.cashAmount.toString());
        // Determine cash payer: if current cashPayerId is receiver, then receiver was paying
        // In counter, if receiver was paying, they might want to change it
        setCounterCashPayer(
          trade.cashPayerId === trade.receiverId ? "me" : "them",
        );
      } else {
        setCounterCashAmount("");
        setCounterCashPayer("me");
      }

      setCounterMessage("");
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to load counter-offer data:", error);
      toast.error(
        locale === "en" ? "Failed to load products" : "Ürünler yüklenemedi",
      );
      setIsCounterMode(false);
    } finally {
      setIsLoadingCounterData(false);
    }
  };

  const handleExitCounterMode = () => {
    setIsCounterMode(false);
    setSelectedCounterProducts([]);
    setSelectedCounterTargetProducts([]);
    setCounterCashAmount("");
    setCounterCashPayer("me");
    setCounterMessage("");
  };

  const toggleCounterProduct = (productId: string) => {
    setSelectedCounterProducts((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      return [...prev, productId];
    });
  };

  const toggleCounterTargetProduct = (productId: string) => {
    setSelectedCounterTargetProducts((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      return [...prev, productId];
    });
  };

  const handleCounterSubmit = () => {
    if (!trade) return;

    if (selectedCounterProducts.length === 0) {
      toast.error(
        locale === "en"
          ? "Please select at least one product to offer"
          : "Lütfen en az bir ürün seçin",
      );
      return;
    }

    if (selectedCounterTargetProducts.length === 0) {
      toast.error(
        locale === "en"
          ? "Please select at least one product you want"
          : "Lütfen en az bir istediğiniz ürünü seçin",
      );
      return;
    }

    // Check if counter-offer is identical to current trade
    const currentInitiatorItemIds = trade.initiatorItems
      .map((item) => item.productId)
      .sort();
    const currentReceiverItemIds = trade.receiverItems
      .map((item) => item.productId)
      .sort();
    const newInitiatorItemIds = selectedCounterProducts.sort();
    const newReceiverItemIds = selectedCounterTargetProducts.sort();
    const newCashAmount = Math.abs(parseFloat(counterCashAmount) || 0);
    const currentCashAmount = Math.abs(trade.cashAmount || 0);

    const isIdentical =
      JSON.stringify(newInitiatorItemIds) ===
        JSON.stringify(currentReceiverItemIds) &&
      JSON.stringify(newReceiverItemIds) ===
        JSON.stringify(currentInitiatorItemIds) &&
      newCashAmount === currentCashAmount;

    if (isIdentical) {
      toast.error(
        locale === "en"
          ? "This counter-offer is identical to the current trade. Please make changes before submitting."
          : "Önceki teklif ile aynı. Değişiklik yapmadan karşı teklif gönderemezsiniz.",
      );
      return;
    }

    // Calculate cash amount: positive = initiator (receiver in counter) pays, negative = receiver (original initiator) pays
    let finalCashAmount: number | undefined = undefined;
    if (counterCashAmount && parseFloat(counterCashAmount) > 0) {
      finalCashAmount =
        counterCashPayer === "me"
          ? parseFloat(counterCashAmount)
          : -parseFloat(counterCashAmount);
    }

    counterMutation.mutate({
      initiatorItems: selectedCounterProducts.map((id) => ({
        productId: id,
        quantity: 1,
      })),
      receiverItems: selectedCounterTargetProducts.map((id) => ({
        productId: id,
        quantity: 1,
      })),
      cashAmount: finalCashAmount,
      message: counterMessage || undefined,
    });
  };

  // --- Derived (only meaningful once `trade` is loaded) --------------------

  const statusMeta = trade
    ? TRADE_STATUS_META[trade.status] || TRADE_STATUS_META.pending
    : TRADE_STATUS_META.pending;
  const isInitiator = !!trade && user?.id === trade.initiatorId;
  const isReceiver = !!trade && user?.id === trade.receiverId;
  const canAccept = isReceiver && trade?.status === "pending";
  const canReject = isReceiver && trade?.status === "pending";
  const canCounter =
    !!trade &&
    isReceiver &&
    trade.status === "pending" &&
    (!trade.responseDeadline || new Date(trade.responseDeadline) > new Date());
  // Cancel is allowed only in early statuses; locked once items enter the warehouse flow
  const cancellableStatuses = new Set([
    "pending",
    "accepted",
    "awaiting_payment",
    "shipping_to_warehouse",
  ]);
  // Warehouse arrival → user cancel kilidi (1 kargo bile depoya ulaşırsa)
  const cancelLockedByWarehouse =
    trade?.status === "shipping_to_warehouse" &&
    !!trade?.firstWarehouseArrivalAt;
  // Backend `canCancel` field'ı (mapToResponseDto.computeTradeCanCancel) varsa
  // onu kullan; yoksa local fallback.
  const canCancel =
    !!user &&
    !!trade &&
    (isInitiator || isReceiver) &&
    (typeof trade.canCancel === "boolean"
      ? trade.canCancel
      : cancellableStatuses.has(trade.status) && !cancelLockedByWarehouse);
  // Buton görünür ama disabled — kullanıcı "neden iptal edemiyorum" diye
  // bilmek için. Eligible bir state'teyiz ama warehouse arrival kilitlemiş.
  const showCancelDisabled =
    !!user &&
    !!trade &&
    (isInitiator || isReceiver) &&
    cancellableStatuses.has(trade.status) &&
    !canCancel;

  return {
    trade,
    isLoading,
    tradeId,
    user,
    t,
    locale,
    countdown,
    statusMeta,
    // perspective / gating
    isInitiator,
    isReceiver,
    canAccept,
    canReject,
    canCounter,
    canCancel,
    showCancelDisabled,
    cashPaymentPending,
    isCashPayer,
    needToShip,
    // shipments
    myToWarehouseShipment,
    otherToWarehouseShipment,
    myFromWarehouseShipment,
    otherFromWarehouseShipment,
    myReturnShipment,
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
    handleOpenCounterModal,
    // counter mode
    isCounterMode,
    isLoadingCounterData,
    counterProducts,
    counterTargetProducts,
    selectedCounterProducts,
    selectedCounterTargetProducts,
    counterCashAmount,
    setCounterCashAmount,
    counterCashPayer,
    setCounterCashPayer,
    counterMessage,
    setCounterMessage,
    handleExitCounterMode,
    toggleCounterProduct,
    toggleCounterTargetProduct,
    handleCounterSubmit,
  };
}

export type TradeDetailVM = ReturnType<typeof useTradeDetail>;
