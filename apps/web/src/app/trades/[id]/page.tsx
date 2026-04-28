"use client";

import { ButtonLink } from "@/components/ui/ButtonLink";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import { motion } from "framer-motion";
import {
  ArrowsRightLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  TruckIcon,
  ChatBubbleLeftRightIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";
import {
  tradesApi,
  listingsApi,
  userApi,
  addressesApi,
  api,
  paymentsApi,
} from "@/lib/api";
import { getProductEffectivePrice } from "@/lib/productPrice";
import { useTranslation } from "@/i18n/LanguageContext";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Radio,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  tradeStatusConfig,
} from "@tarodan/ui";

interface TradeItem {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string;
  productImages?: { cardUrl?: string; detailUrl?: string }[];
  side: string;
  quantity: number;
  valueAtTrade: number;
}

interface TradeShipment {
  id: string;
  direction: "to_warehouse" | "from_warehouse" | "return" | string;
  senderUserId?: string | null;
  recipientUserId?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiatorId: string;
  initiatorName: string;
  receiverId: string;
  receiverName: string;
  initiatorItems: TradeItem[];
  receiverItems: TradeItem[];
  cashAmount?: number;
  cashPayerId?: string;
  initiatorMessage?: string;
  receiverMessage?: string;
  responseDeadline?: string;
  paymentDeadline?: string;
  shippingDeadline?: string;
  initiatorShipment?: {
    carrier: string;
    trackingNumber: string;
    status: string;
    shippedAt?: string;
    deliveredAt?: string;
  };
  receiverShipment?: {
    carrier: string;
    trackingNumber: string;
    status: string;
    shippedAt?: string;
    deliveredAt?: string;
  };
  shipments?: TradeShipment[];
  cashPayment?: {
    id: string;
    payerId: string;
    recipientId: string;
    amount: number;
    commission: number;
    totalAmount: number;
    status: string;
    paidAt?: string;
    refundedAt?: string;
  };
  cashRefundedAt?: string;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  version?: number;
}

const tradeStatusEnLabels: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  awaiting_payment: "Awaiting Payment",
  shipping_to_warehouse: "Shipping to Warehouse",
  at_warehouse: "At Tarodan Warehouse",
  admin_reviewing: "Under Review",
  shipping_to_recipients: "Shipping to Recipients",
  returning: "Returning",
  initiator_shipped: "Shipped",
  receiver_shipped: "Shipped",
  both_shipped: "Both Parties Shipped",
  initiator_received: "Received",
  receiver_received: "Received",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

const tradeStatusTrLabels: Record<string, string> = {
  pending: "Bekliyor",
  accepted: "Kabul Edildi",
  rejected: "Reddedildi",
  awaiting_payment: "Ödeme Bekleniyor",
  shipping_to_warehouse: "Depoya Gönderim",
  at_warehouse: "Tarodan Deposunda",
  admin_reviewing: "İnceleniyor",
  shipping_to_recipients: "Alıcılara Gönderim",
  returning: "İade Yolda",
  initiator_shipped: "Gönderildi",
  receiver_shipped: "Karşı Taraf Gönderdi",
  both_shipped: "İki Taraf Gönderdi",
  initiator_received: "Teslim Alındı",
  receiver_received: "Karşı Taraf Teslim Aldı",
  completed: "Tamamlandı",
  cancelled: "İptal Edildi",
  disputed: "İtiraz Açıldı",
};

const getTradeStatusMeta = (
  locale: string,
): Record<string, { description: string }> => ({
  pending: {
    description:
      locale === "en"
        ? "Offer is being evaluated by the recipient"
        : "Teklif alıcı tarafından değerlendiriliyor",
  },
  accepted: {
    description:
      locale === "en"
        ? "Trade accepted, awaiting shipment"
        : "Takas kabul edildi, gönderim bekleniyor",
  },
  rejected: {
    description: locale === "en" ? "Offer rejected" : "Teklif reddedildi",
  },
  awaiting_payment: {
    description:
      locale === "en"
        ? "Cash payment required to proceed"
        : "Devam etmek için nakit ödeme gerekli",
  },
  shipping_to_warehouse: {
    description:
      locale === "en"
        ? "Both parties must ship their items to the Tarodan warehouse"
        : "Her iki taraf ürünlerini Tarodan deposuna göndermelidir",
  },
  at_warehouse: {
    description:
      locale === "en"
        ? "Your items are at the Tarodan warehouse and being reviewed"
        : "Ürünleriniz Tarodan deposunda, inceleme başlatıldı",
  },
  admin_reviewing: {
    description:
      locale === "en"
        ? "An admin is physically reviewing the items"
        : "Admin ürünleri fiziksel olarak inceliyor",
  },
  shipping_to_recipients: {
    description:
      locale === "en"
        ? "Admin approved — items are being shipped to the recipients"
        : "Admin onayladı — ürünler alıcılara gönderiliyor",
  },
  returning: {
    description:
      locale === "en"
        ? "Trade was rejected — items are being returned to their owners"
        : "Takas reddedildi — ürünler sahiplerine iade ediliyor",
  },
  initiator_shipped: {
    description:
      locale === "en"
        ? "Initiator shipped their items"
        : "Başlatıcı ürünlerini gönderdi",
  },
  receiver_shipped: {
    description:
      locale === "en"
        ? "Receiver shipped their items"
        : "Alıcı ürünlerini gönderdi",
  },
  both_shipped: {
    description:
      locale === "en"
        ? "Both parties shipped their items"
        : "Her iki taraf da ürünlerini gönderdi",
  },
  initiator_received: {
    description:
      locale === "en"
        ? "Initiator received the items"
        : "Başlatıcı ürünleri teslim aldı",
  },
  receiver_received: {
    description:
      locale === "en"
        ? "Receiver received the items"
        : "Alıcı ürünleri teslim aldı",
  },
  completed: {
    description:
      locale === "en"
        ? "Trade successfully completed"
        : "Takas başarıyla tamamlandı",
  },
  cancelled: {
    description: locale === "en" ? "Trade cancelled" : "Takas iptal edildi",
  },
  disputed: {
    description:
      locale === "en" ? "Dispute opened for trade" : "Takas için itiraz açıldı",
  },
});

export default function TradeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { t, locale } = useTranslation();
  const tradeId = params.id as string;
  const TRADE_STATUS_META = getTradeStatusMeta(locale);
  const getTradeStatusLabel = (s: string) =>
    locale === "en"
      ? tradeStatusEnLabels[s] || s
      : tradeStatusConfig[s]?.label || tradeStatusTrLabels[s] || s;

  const [isActionLoading, setIsActionLoading] = useState(false);
  const [cashPaymentLoading, setCashPaymentLoading] = useState(false);
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
  const [shipCarrier, setShipCarrier] = useState("aras");
  const [shipTrackingNumber, setShipTrackingNumber] = useState("");

  // Card states for inline cash payment checkout
  const [cardError, setCardError] = useState<string | null>(null);
  const [savedCards, setSavedCards] = useState<
    Array<{
      id: string;
      cardBrand: string;
      lastFour: string;
      expiryMonth: number;
      expiryYear: number;
      isDefault?: boolean;
    }>
  >([]);
  const [selectedSavedCard, setSelectedSavedCard] = useState<string | null>(
    null,
  );
  const [useNewCard, setUseNewCard] = useState(false);
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const [cardsFetched, setCardsFetched] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      toast.error(
        locale === "en"
          ? "Please login to view trade details"
          : "Takas detaylarını görmek için giriş yapmalısınız",
      );
      router.push(`/login?redirect=/trades/${tradeId}`);
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
      router.push("/trades");
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

  useEffect(() => {
    if (!cashPaymentPending || !isCashPayer || cardsFetched) return;
    api
      .get("/payments/methods")
      .then((res) => {
        const cards = res.data?.methods || res.data || [];
        setSavedCards(cards);
        const defaultCard = cards.find((c: any) => c.isDefault);
        if (defaultCard) setSelectedSavedCard(defaultCard.id);
        else if (cards.length > 0) setSelectedSavedCard(cards[0].id);
        if (cards.length === 0) setUseNewCard(true);
        setCardsFetched(true);
      })
      .catch(() => {
        setUseNewCard(true);
        setCardsFetched(true);
      });
  }, [cashPaymentPending, isCashPayer, cardsFetched]);

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

  const needToShipToWarehouse =
    !!trade &&
    !!user &&
    trade.status === "shipping_to_warehouse" &&
    (user.id === trade.initiatorId || user.id === trade.receiverId) &&
    (!myToWarehouseShipment || !myToWarehouseShipment.shippedAt);

  // Fallback for older API payloads where `shipments` is missing.
  const fallbackMyWarehouseShipment =
    trade && user
      ? user.id === trade.initiatorId
        ? trade.initiatorShipment
        : trade.receiverShipment
      : undefined;
  const fallbackOtherWarehouseShipment =
    trade && user
      ? user.id === trade.initiatorId
        ? trade.receiverShipment
        : trade.initiatorShipment
      : undefined;

  const myWarehouseShipped =
    !!(myToWarehouseShipment?.shippedAt || fallbackMyWarehouseShipment?.shippedAt);
  const otherWarehouseShipped =
    !!(
      otherToWarehouseShipment?.shippedAt || fallbackOtherWarehouseShipment?.shippedAt
    );

  const warehouseProgressText = myWarehouseShipped
    ? otherWarehouseShipped
      ? locale === "en"
        ? "Both shipments are on the way to the warehouse. Waiting for warehouse delivery confirmation."
        : "Her iki gönderi depoya yolda. Depo teslim teyidi bekleniyor."
      : locale === "en"
        ? "Your shipment is submitted. Waiting for the other party to ship to the warehouse."
        : "Gönderiniz alındı. Karşı tarafın depoya gönderimi bekleniyor."
    : otherWarehouseShipped
      ? locale === "en"
        ? "The other party has shipped. Please submit your shipment to the warehouse."
        : "Karşı taraf gönderdi. Lütfen siz de depoya gönderimi tamamlayın."
      : locale === "en"
        ? "Both parties must submit shipment details to send items to the warehouse."
        : "Ürünlerin depoya ulaşması için her iki tarafın da gönderim yapması gerekiyor.";

  const addressesQuery = useQuery({
    queryKey: ["addresses"],
    queryFn: async () => {
      const res = await addressesApi.getAll();
      const list = res.data?.data ?? res.data?.addresses ?? res.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: !!needToShip || !!needToShipToWarehouse,
    meta: { page: "trade-ship-addresses" },
  });
  const addresses = addressesQuery.data ?? [];

  useEffect(() => {
    if (addresses.length > 0 && !shipAddressId) {
      setShipAddressId(addresses[0].id);
    }
  }, [addresses, shipAddressId]);

  const handleCashPayment = async () => {
    if (!trade) return;
    setCashPaymentLoading(true);
    setCardError(null);
    try {
      const res = await paymentsApi.initiateTradeCash(trade.id);
      const data = res.data?.data ?? res.data;

      if (data?.useBypass && data?.paymentId) {
        try {
          const bypassRes = await paymentsApi.bypassComplete(data.paymentId as string);
          if (bypassRes.data?.success) {
            toast.success(
              locale === "en" ? "Payment successful" : "Ödeme başarılı",
            );
            await invalidateTrade();
            // Trade cash payment → direkt takas sayfasına dön, /orders'a uğrama
            router.push(`/trades/${trade.id}?paid=1`);
            return;
          }
        } catch {
          toast.error(
            locale === "en"
              ? "Bypass payment failed"
              : "Test ödemesi tamamlanamadı",
          );
        }
        setCashPaymentLoading(false);
        return;
      }

      if (data?.paymentUrl) {
        if (saveCard && useNewCard && cardNumber && cardExpiry) {
          try {
            const [month, year] = cardExpiry.split("/");
            await api.post("/payments/methods", {
              cardNumber: cardNumber.replace(/\s/g, ""),
              cardHolder: cardName,
              expiryMonth: parseInt(month),
              expiryYear: parseInt("20" + year),
              cvv: cardCvc,
            });
          } catch {}
        }
        window.location.href = data.paymentUrl;
        return;
      }

      if (data?.paymentId) {
        router.push(`/payment/${data.paymentId}`);
        return;
      }

      toast.error(
        locale === "en" ? "Could not start payment" : "Ödeme başlatılamadı",
      );
      setCashPaymentLoading(false);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          (locale === "en"
            ? "Payment initiation failed"
            : "Ödeme başlatılamadı"),
      );
      setCashPaymentLoading(false);
    }
  };

  const handleShipSubmit = async () => {
    if (!trade || !shipAddressId || !shipCarrier) {
      toast.error(
        locale === "en"
          ? "Please select address and carrier"
          : "Lütfen adres ve kargo firması seçin",
      );
      return;
    }
    setIsActionLoading(true);
    try {
      await tradesApi.ship(trade.id, {
        fromAddressId: shipAddressId,
        carrier: shipCarrier,
      });
      toast.success(
        locale === "en"
          ? "Shipping info submitted"
          : "Kargo bilgisi gönderildi",
      );
      setShipAddressId("");
      setShipCarrier("aras");
      await invalidateTrade();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to submit shipping:", error);
      toast.error(
        error.response?.data?.message ||
          (locale === "en"
            ? "Failed to submit shipping"
            : "Kargo bilgisi gönderilemedi"),
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleShipToWarehouseSubmit = async () => {
    if (!trade || !shipAddressId || !shipCarrier) {
      toast.error(
        locale === "en"
          ? "Please select address and carrier"
          : "Lütfen adres ve kargo firması seçin",
      );
      return;
    }
    setIsActionLoading(true);
    try {
      await tradesApi.shipToWarehouse(trade.id, {
        fromAddressId: shipAddressId,
        carrier: shipCarrier,
        ...(shipTrackingNumber.trim()
          ? { trackingNumber: shipTrackingNumber.trim() }
          : {}),
      });
      toast.success(
        locale === "en"
          ? "Shipping info submitted"
          : "Kargo bilgisi gönderildi",
      );
      setShipAddressId("");
      setShipCarrier("aras");
      setShipTrackingNumber("");
      await invalidateTrade();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to submit shipping-to-warehouse:", error);
      toast.error(
        error.response?.data?.message ||
          (locale === "en"
            ? "Failed to submit shipping"
            : "Kargo bilgisi gönderilemedi"),
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!trade) return;
    setIsActionLoading(true);
    try {
      await tradesApi.confirmReceipt(trade.id);
      toast.success(
        locale === "en"
          ? "Receipt confirmed"
          : "Teslim alındı olarak işaretlendi",
      );
      await invalidateTrade();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to confirm receipt:", error);
      toast.error(
        error.response?.data?.message ||
          (locale === "en"
            ? "Failed to confirm receipt"
            : "Teslim alındı işaretlenemedi"),
      );
    } finally {
      setIsActionLoading(false);
    }
  };

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

  const handleAccept = async () => {
    if (!trade) return;

    setIsActionLoading(true);
    try {
      await tradesApi.accept(
        trade.id,
        locale === "en"
          ? "I accept the trade offer"
          : "Takas teklifini kabul ediyorum",
      );
      toast.success(
        locale === "en" ? "Trade accepted!" : "Takas kabul edildi!",
      );
      await invalidateTrade();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to accept trade:", error);
      toast.error(
        error.response?.data?.message ||
          (locale === "en"
            ? "Failed to accept trade"
            : "Takas kabul edilemedi"),
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!trade) {
      return;
    }

    setIsActionLoading(true);
    try {
      await tradesApi.reject(trade.id, rejectReason.trim() || undefined);
      toast.success(locale === "en" ? "Trade rejected" : "Takas reddedildi");
      setShowRejectModal(false);
      setRejectReason("");
      await invalidateTrade();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to reject trade:", error);
      toast.error(
        error.response?.data?.message ||
          (locale === "en" ? "Failed to reject trade" : "Takas reddedilemedi"),
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!trade) return;

    if (
      !confirm(
        locale === "en"
          ? "Are you sure you want to cancel this trade?"
          : "Bu takası iptal etmek istediğinizden emin misiniz?",
      )
    ) {
      return;
    }

    setIsActionLoading(true);
    try {
      await tradesApi.cancel(
        trade.id,
        locale === "en"
          ? "Cancelled by user"
          : "Kullanıcı tarafından iptal edildi",
      );
      toast.success(locale === "en" ? "Trade cancelled" : "Takas iptal edildi");
      await invalidateTrade();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to cancel trade:", error);
      toast.error(
        error.response?.data?.message ||
          (locale === "en"
            ? "Failed to cancel trade"
            : "Takas iptal edilemedi"),
      );
    } finally {
      setIsActionLoading(false);
    }
  };

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

  const handleCounterSubmit = async () => {
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

    setIsActionLoading(true);
    try {
      // Calculate cash amount: positive = initiator (receiver in counter) pays, negative = receiver (original initiator) pays
      let finalCashAmount: number | undefined = undefined;
      if (counterCashAmount && parseFloat(counterCashAmount) > 0) {
        finalCashAmount =
          counterCashPayer === "me"
            ? parseFloat(counterCashAmount)
            : -parseFloat(counterCashAmount);
      }

      await tradesApi.counter(trade.id, {
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
      toast.success(
        locale === "en" ? "Counter offer sent!" : "Karşı teklif gönderildi!",
      );
      setIsCounterMode(false);
      await invalidateTrade();
    } catch (error: any) {
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
    } finally {
      setIsActionLoading(false);
    }
  };

  const getProductImage = (product: any): string => {
    if (!product.images || product.images.length === 0) {
      return "https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün";
    }
    const img = product.images[0];
    const url =
      typeof img === "string" ? img : (img.cardUrl ?? img.detailUrl ?? img.url);
    return url || "https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-border-subtle rounded w-1/3" />
            <div className="card p-6">
              <div className="h-64 bg-border-subtle rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="min-h-screen bg-surface py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="card p-6 text-center">
            <p className="text-muted">Takas bulunamadı</p>
            <ButtonLink href="/trades" className="mt-4 inline-block">
              Takaslara Dön
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  const statusMeta =
    TRADE_STATUS_META[trade.status] || TRADE_STATUS_META.pending;
  const isInitiator = user?.id === trade.initiatorId;
  const isReceiver = user?.id === trade.receiverId;
  const canAccept = isReceiver && trade.status === "pending";
  const canReject = isReceiver && trade.status === "pending";
  const canCounter =
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
  const canCancel =
    !!user &&
    (isInitiator || isReceiver) &&
    cancellableStatuses.has(trade.status);

  const getItemImage = (item: TradeItem) => {
    const url =
      item.productImages?.[0]?.cardUrl ??
      item.productImages?.[0]?.detailUrl ??
      item.productImage;
    return url || "https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün";
  };

  const calculateTotalValue = (items: TradeItem[]) => {
    return items.reduce(
      (sum, item) => sum + item.valueAtTrade * item.quantity,
      0,
    );
  };

  const initiatorTotal = calculateTotalValue(trade.initiatorItems);
  const receiverTotal = calculateTotalValue(trade.receiverItems);
  const valueDifference = receiverTotal - initiatorTotal;

  // Kullanıcı perspektifinden ürünleri ayarla
  const myItems = isInitiator ? trade.initiatorItems : trade.receiverItems;
  const theirItems = isInitiator ? trade.receiverItems : trade.initiatorItems;
  const theirName = isInitiator ? trade.receiverName : trade.initiatorName;
  const myTotal = isInitiator ? initiatorTotal : receiverTotal;
  const theirTotal = isInitiator ? receiverTotal : initiatorTotal;

  // Counter-offer edit mode
  if (isCounterMode) {
    return (
      <div className="min-h-screen bg-surface py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6">
            <Button
              variant="secondary"
              onClick={handleExitCounterMode}
              className="text-primary-500 hover:text-primary-600 mb-4 inline-block"
            >
              ← {locale === "en" ? "Back to Trade" : "Takasa Dön"}
            </Button>
            <h1 className="text-3xl font-bold text-heading flex items-center gap-3">
              <ArrowsRightLeftIcon className="w-8 h-8 text-primary-500" />
              {locale === "en" ? "Counter Offer" : "Karşı Teklif"}
            </h1>
            <p className="text-muted mt-2">
              {locale === "en"
                ? "Modify the trade offer"
                : "Takas teklifini değiştirin"}
            </p>
          </div>

          {isLoadingCounterData ? (
            <div className="text-center py-12">
              <Spinner
                size="lg"
                color="border-primary-500 border-t-transparent"
                className="mx-auto mb-4"
              />
              <p className="text-muted">
                {locale === "en"
                  ? "Loading products..."
                  : "Ürünler yükleniyor..."}
              </p>
            </div>
          ) : (
            <>
              {/* Products Comparison - Side by Side */}
              <div className="flex flex-col lg:flex-row items-stretch gap-6 mb-6">
                {/* SOL - İstenilen Ürünler */}
                <div className="bg-surface-elevated rounded-xl p-6 shadow-sm border border-border flex-1">
                  <h2 className="text-lg font-semibold text-heading mb-4">
                    {locale === "en"
                      ? "Products You Want"
                      : "İstediğiniz Ürünler"}
                  </h2>
                  {counterTargetProducts.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted">
                        {locale === "en"
                          ? "No products available from this seller"
                          : "Bu satıcıdan kullanılabilir ürün yok"}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
                      {counterTargetProducts.map((product) => {
                        const isSelected =
                          selectedCounterTargetProducts.includes(product.id);
                        return (
                          <Button
                            variant="secondary"
                            key={product.id}
                            onClick={() =>
                              toggleCounterTargetProduct(product.id)
                            }
                            className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? "border-primary-500 ring-2 ring-primary-200"
                                : "border-border hover:border-border"
                            }`}
                          >
                            {isSelected && (
                              <div className="absolute top-2 right-2 z-10 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                                <CheckIcon className="w-4 h-4 text-inverted" />
                              </div>
                            )}
                            <div className="aspect-square relative bg-surface-alt">
                              <OptimizedImage
                                src={getProductImage(product)}
                                alt={product.title}
                                fill
                                className="object-cover"
                                logContext={{
                                  productId: product.id,
                                  page: "trades-detail-receiver",
                                }}
                              />
                            </div>
                            <div className="p-2 text-left">
                              <p className="text-xs font-medium text-heading line-clamp-1">
                                {product.title}
                              </p>
                              <p className="text-xs font-bold text-primary-500">
                                {getProductEffectivePrice(
                                  product,
                                ).toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}{" "}
                                TL
                              </p>
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ORTA - Takas İkonu */}
                <div className="flex items-center justify-center py-4 lg:py-0">
                  <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
                    <ArrowsRightLeftIcon className="w-8 h-8 text-primary-600" />
                  </div>
                </div>

                {/* SAĞ - Benim Ürünlerim */}
                <div className="bg-surface-elevated rounded-xl p-6 shadow-sm border border-border flex-1">
                  <h2 className="text-lg font-semibold text-heading mb-4">
                    {locale === "en"
                      ? "Products You Offer"
                      : "Teklif Edeceğiniz Ürünler"}
                  </h2>
                  {counterProducts.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted mb-4">
                        {locale === "en"
                          ? "No products available"
                          : "Kullanılabilir ürün yok"}
                      </p>
                      <Link
                        href="/profile/listings"
                        className="text-primary-500 hover:text-primary-600 font-medium"
                      >
                        {locale === "en"
                          ? "Go to My Listings →"
                          : "İlanlarıma Git →"}
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
                      {counterProducts.map((product) => {
                        const isSelected = selectedCounterProducts.includes(
                          product.id,
                        );
                        return (
                          <Button
                            variant="secondary"
                            key={product.id}
                            onClick={() => toggleCounterProduct(product.id)}
                            className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? "border-primary-500 ring-2 ring-primary-200"
                                : "border-border hover:border-border"
                            }`}
                          >
                            {isSelected && (
                              <div className="absolute top-2 right-2 z-10 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                                <CheckIcon className="w-4 h-4 text-inverted" />
                              </div>
                            )}
                            <div className="aspect-square relative bg-surface-alt">
                              <OptimizedImage
                                src={getProductImage(product)}
                                alt={product.title}
                                fill
                                className="object-cover"
                                logContext={{
                                  productId: product.id,
                                  page: "trades-detail-counter",
                                }}
                              />
                            </div>
                            <div className="p-2 text-left">
                              <p className="text-xs font-medium text-heading line-clamp-1">
                                {product.title}
                              </p>
                              <p className="text-xs font-bold text-primary-500">
                                {getProductEffectivePrice(
                                  product,
                                ).toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}{" "}
                                TL
                              </p>
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Cash Amount */}
              <div className="bg-surface-elevated rounded-xl p-6 shadow-sm border border-border mb-6">
                <h2 className="text-lg font-semibold text-heading mb-4">
                  {t("trade.cashDifference")} ({t("common.optional")})
                </h2>
                <p className="text-muted text-sm mb-4">
                  {locale === "en"
                    ? "You can add cash to balance the trade value."
                    : "Takas değerini dengelemek için nakit fark ekleyebilirsiniz."}
                </p>
                <div className="space-y-4">
                  <div className="relative max-w-xs">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
                      ₺
                    </span>
                    <Input
                      type="number"
                      value={counterCashAmount}
                      onChange={(e) => setCounterCashAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="pl-10 pr-4 h-12 rounded-xl"
                    />
                  </div>
                  {parseFloat(counterCashAmount) > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-body">
                        {locale === "en"
                          ? "Who will pay the cash difference?"
                          : "Nakit farkı kim ödeyecek?"}
                      </p>
                      <div className="flex gap-4">
                        <Radio
                          name="counterCashPayer"
                          value="me"
                          checked={counterCashPayer === "me"}
                          onChange={(e) =>
                            setCounterCashPayer(e.target.value as "me" | "them")
                          }
                          label={
                            locale === "en" ? "I will pay" : "Ben ödeyeceğim"
                          }
                        />
                        <Radio
                          name="counterCashPayer"
                          value="them"
                          checked={counterCashPayer === "them"}
                          onChange={(e) =>
                            setCounterCashPayer(e.target.value as "me" | "them")
                          }
                          label={
                            locale === "en"
                              ? "They will pay"
                              : "Karşı taraf ödeyecek"
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Message */}
              <div className="bg-surface-elevated rounded-xl p-6 shadow-sm border border-border mb-6">
                <h2 className="text-lg font-semibold text-heading mb-4">
                  {t("trade.message")} ({t("common.optional")})
                </h2>
                <Textarea
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                  placeholder={
                    locale === "en" ? "Leave a message..." : "Mesaj bırakın..."
                  }
                  rows={4}
                  maxLength={500}
                  className="px-4 py-3 rounded-xl resize-none"
                />
                <p className="text-sm text-muted mt-2 text-right">
                  {counterMessage.length}/500
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-4">
                <Button
                  variant="secondary"
                  size="lg"
                  className="flex-1"
                  onClick={handleExitCounterMode}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1 flex items-center justify-center gap-2"
                  onClick={handleCounterSubmit}
                  disabled={
                    isActionLoading ||
                    selectedCounterProducts.length === 0 ||
                    selectedCounterTargetProducts.length === 0
                  }
                >
                  {isActionLoading ? (
                    <>
                      <Spinner
                        size="sm"
                        color="border-surface-elevated border-t-transparent"
                      />
                      {locale === "en" ? "Sending..." : "Gönderiliyor..."}
                    </>
                  ) : (
                    <>
                      <ArrowsRightLeftIcon className="w-5 h-5" />
                      {locale === "en"
                        ? "Send Counter Offer"
                        : "Karşı Teklif Gönder"}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/trades"
            className="text-primary-500 hover:text-primary-600 mb-4 inline-block"
          >
            ← Takaslara Dön
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-heading">Takas Detayı</h1>
              <div className="flex items-center gap-4 mt-1">
                <p className="text-muted">Takas No: {trade.tradeNumber}</p>
                {trade.version && trade.version > 1 && (
                  <span className="px-2 py-1 bg-primary-100 text-primary-700 text-xs font-medium rounded">
                    {locale === "en"
                      ? `Counter-offer #${trade.version - 1}`
                      : `Karşı Teklif #${trade.version - 1}`}
                  </span>
                )}
              </div>
            </div>
            <StatusBadge
              status={trade.status}
              config={tradeStatusConfig}
              label={getTradeStatusLabel(trade.status)}
            />
          </div>
        </div>

        {/* Status Description */}
        <div className="card p-4 mb-6 bg-primary-50 border-primary-200">
          <p className="text-sm text-primary-800">{statusMeta.description}</p>
          {(trade.status === "cancelled" || trade.status === "rejected") &&
            trade.cancelReason && (
              <p className="text-sm text-muted mt-2">
                <span className="font-medium">
                  {locale === "en" ? "Reason: " : "Sebep: "}
                </span>
                {trade.cancelReason}
              </p>
            )}
        </div>

        {/* Completed Trade Summary - only when status is completed */}
        {trade.status === "completed" && (
          <div className="card p-6 mb-6 bg-success-50 border-2 border-success-200 rounded-xl">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-success-500 flex items-center justify-center">
                <CheckCircleIcon className="w-7 h-7 text-inverted" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-success-800 mb-1">
                  {t("trade.completedSummaryTitle")}
                </h2>
                <p className="text-success-700 text-sm mb-4">
                  {t("trade.completedSummaryDesc")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="bg-surface-elevated/60 rounded-lg px-3 py-2">
                    <p className="text-xs font-medium text-success-700 uppercase tracking-wide">
                      {t("trade.createdAt")}
                    </p>
                    <p className="text-sm font-semibold text-heading">
                      {trade.createdAt
                        ? new Date(trade.createdAt).toLocaleDateString(
                            locale === "en" ? "en-US" : "tr-TR",
                            { dateStyle: "medium" },
                          )
                        : "—"}
                    </p>
                  </div>
                  {trade.acceptedAt && (
                    <div className="bg-surface-elevated/60 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-success-700 uppercase tracking-wide">
                        {t("trade.acceptedAt")}
                      </p>
                      <p className="text-sm font-semibold text-heading">
                        {new Date(trade.acceptedAt).toLocaleDateString(
                          locale === "en" ? "en-US" : "tr-TR",
                          { dateStyle: "medium" },
                        )}
                      </p>
                    </div>
                  )}
                  {trade.completedAt && (
                    <div className="bg-surface-elevated/60 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-success-700 uppercase tracking-wide">
                        {t("trade.completedAt")}
                      </p>
                      <p className="text-sm font-semibold text-heading">
                        {new Date(trade.completedAt).toLocaleDateString(
                          locale === "en" ? "en-US" : "tr-TR",
                          { dateStyle: "medium" },
                        )}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/trades"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-success-600 hover:bg-success-700 text-inverted rounded-lg font-medium transition-colors text-sm"
                  >
                    {t("trade.backToTrades")}
                  </Link>
                  <Link
                    href="/listings"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-surface-elevated hover:bg-success-100 text-success-800 border border-success-300 rounded-lg font-medium transition-colors text-sm"
                  >
                    {t("trade.browseListings")}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Countdown Timer */}
        {countdown && (
          <div className="card p-4 mb-6 bg-primary-50 border-primary-200">
            <div className="flex items-center gap-3">
              <ClockIcon className="w-6 h-6 text-primary-600" />
              <div>
                <p className="font-semibold text-primary-800 text-lg font-mono">
                  {countdown}
                </p>
                <p className="text-sm text-primary-600">
                  Lütfen süre dolmadan işleminizi tamamlayın
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Güvenli takas bilgisi - pending veya accepted durumunda */}
        {(trade.status === "pending" ||
          trade.status === "accepted" ||
          trade.status === "awaiting_payment") && (
          <div className="card p-4 mb-6 bg-info-50 border-info-200">
            <h3 className="font-semibold text-info-900 mb-2 flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5 text-info-600" />
              {t("trade.safeTradeTitle")}
            </h3>
            <p className="text-sm text-info-800">{t("trade.safeTradeDesc")}</p>
          </div>
        )}

        {/* Safe-trade (escrow) warehouse info banner */}
        {(trade.status === "at_warehouse" ||
          trade.status === "admin_reviewing") && (
          <div className="card p-6 mb-6 bg-info-50 border-2 border-info-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-info-500 flex items-center justify-center">
                <ShieldCheckIcon className="w-7 h-7 text-inverted" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-info-900 mb-1">
                  {locale === "en"
                    ? "Your items are at the Tarodan warehouse"
                    : "Ürünleriniz Tarodan Deposunda"}
                </h2>
                <p className="text-sm text-info-800">
                  {locale === "en"
                    ? "Our team is reviewing the items. You will be notified once the review is complete."
                    : "Ekibimiz ürünleri inceliyor. İnceleme tamamlandığında bilgilendirileceksiniz."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Returning banner */}
        {trade.status === "returning" && (
          <div className="card p-6 mb-6 bg-warning-50 border-2 border-warning-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-warning-500 flex items-center justify-center">
                <XCircleIcon className="w-7 h-7 text-inverted" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-warning-900 mb-1">
                  {locale === "en"
                    ? "Trade rejected by admin"
                    : "Takas reddedildi"}
                </h2>
                {trade.cancelReason && (
                  <p className="text-sm text-warning-800 mb-2">
                    <span className="font-medium">
                      {locale === "en" ? "Reason: " : "Sebep: "}
                    </span>
                    {trade.cancelReason}
                  </p>
                )}
                <p className="text-sm text-warning-800">
                  {locale === "en"
                    ? "Your items are being returned to you."
                    : "Ürünleriniz size iade ediliyor."}
                </p>
                {(trade.cashRefundedAt || trade.cashPayment?.refundedAt) && (
                  <p className="text-sm text-success-700 mt-2 font-medium">
                    {locale === "en"
                      ? "Cash has been refunded"
                      : "Nakit iade edildi"}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Trade Items Comparison */}
        <div className="flex flex-col lg:flex-row items-stretch gap-6 mb-6">
          {/* SOL - Karşı Tarafın Ürünü */}
          <div className="card p-6 flex-1">
            <h2 className="text-xl font-semibold mb-4">{theirName}'in Ürünü</h2>
            <div className="space-y-3 mb-4 max-h-[280px] overflow-y-auto">
              {theirItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/listings/${item.productId}`}
                  className="flex items-center gap-3 p-3 bg-surface rounded-lg hover:bg-surface-alt transition-colors"
                >
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-border-subtle flex-shrink-0">
                    <OptimizedImage
                      src={getItemImage(item)}
                      alt={item.productTitle}
                      fill
                      className="object-cover"
                      sizes="64px"
                      fallbackSrc="https://placehold.co/64x64/f3f4f6/9ca3af?text=Ürün"
                      logContext={{
                        tradeId,
                        itemId: item.id,
                        page: "trade-detail-their",
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-heading truncate">
                      {item.productTitle}
                    </p>
                    <p className="text-sm text-muted">
                      {item.quantity}x •{" "}
                      {item.valueAtTrade.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-muted">Toplam Değer</p>
              <p className="text-2xl font-bold text-heading">
                {theirTotal.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL
              </p>
            </div>
          </div>

          {/* ORTA - Takas İkonu */}
          <div className="flex items-center justify-center py-4 lg:py-0">
            <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
              <ArrowsRightLeftIcon className="w-8 h-8 text-primary-600" />
            </div>
          </div>

          {/* SAĞ - Benim Teklifim */}
          <div className="card p-6 flex-1">
            <h2 className="text-xl font-semibold mb-4">Sizin Teklifiniz</h2>
            <div className="space-y-3 mb-4 max-h-[280px] overflow-y-auto">
              {myItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/listings/${item.productId}`}
                  className="flex items-center gap-3 p-3 bg-surface rounded-lg hover:bg-surface-alt transition-colors"
                >
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-border-subtle flex-shrink-0">
                    <OptimizedImage
                      src={getItemImage(item)}
                      alt={item.productTitle}
                      fill
                      className="object-cover"
                      sizes="64px"
                      fallbackSrc="https://placehold.co/64x64/f3f4f6/9ca3af?text=Ürün"
                      logContext={{
                        tradeId,
                        itemId: item.id,
                        page: "trade-detail-mine",
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-heading truncate">
                      {item.productTitle}
                    </p>
                    <p className="text-sm text-muted">
                      {item.quantity}x •{" "}
                      {item.valueAtTrade.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-muted">Toplam Değer</p>
              <p className="text-2xl font-bold text-heading">
                {myTotal.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL
              </p>
            </div>
          </div>
        </div>

        {/* Value Difference & Cash Payment */}
        {trade.cashAmount && trade.cashAmount > 0 && (
          <div className="card p-6 mb-6 bg-success-50 border-success-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-muted">
                  {locale === "en" ? "Cash Difference" : "Nakit Fark"}
                </p>
                <p className="text-2xl font-bold text-success-700">
                  {Math.abs(trade.cashAmount).toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  TL
                </p>
                {trade.cashPayment && trade.cashPayment.commission > 0 && (
                  <p className="text-xs text-muted mt-1">
                    {locale === "en"
                      ? "Total with commission:"
                      : "Komisyon dahil toplam:"}{" "}
                    {trade.cashPayment.totalAmount.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    TL
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted">
                  {trade.cashPayerId === trade.initiatorId
                    ? `${trade.initiatorName} ${locale === "en" ? "will pay" : "ödeyecek"}`
                    : `${trade.receiverName} ${locale === "en" ? "will pay" : "ödeyecek"}`}
                </p>
                {trade.cashPayment?.status === "completed" && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success-700 bg-success-100 px-2 py-1 rounded-full mt-1">
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    {locale === "en" ? "Paid" : "Ödendi"}
                  </span>
                )}
              </div>
            </div>

            {/* Inline info for the non-payer when awaiting payment */}
            {trade.status === "awaiting_payment" &&
              user &&
              trade.cashPayerId !== user.id &&
              trade.cashPayment?.status !== "completed" && (
                <div className="pt-4 border-t border-success-200">
                  <div className="flex items-center gap-3 px-4 py-3 bg-surface-elevated/70 rounded-lg">
                    <ClockIcon className="w-5 h-5 text-success-700" />
                    <p className="text-sm text-body">
                      {locale === "en"
                        ? "Waiting for the other party to complete payment."
                        : "Karşı tarafın ödemeyi tamamlaması bekleniyor."}
                    </p>
                  </div>
                </div>
              )}

            {/* Inline checkout for cash payer */}
            {(trade.status === "accepted" ||
              trade.status === "awaiting_payment") &&
              user &&
              trade.cashPayerId === user.id &&
              trade.cashPayment?.status !== "completed" && (
                <div className="pt-4 border-t border-success-200 space-y-5">
                  <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-5 py-3 rounded-lg -mx-1">
                    <h3 className="text-base font-semibold text-inverted flex items-center gap-2">
                      <CreditCardIcon className="w-5 h-5" />
                      {locale === "en"
                        ? "Complete Your Payment"
                        : "Ödemenizi Tamamlayın"}
                    </h3>
                    <p className="text-sm text-primary-100 mt-0.5">
                      {locale === "en"
                        ? "The trade has been accepted. Complete the cash difference payment to proceed."
                        : "Takas kabul edildi. Devam etmek için nakit fark ödemesini tamamlayın."}
                    </p>
                  </div>

                  {cardError && (
                    <div className="flex items-center gap-2 p-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
                      <span aria-hidden>!</span>
                      {cardError}
                    </div>
                  )}

                  {/* Card Information */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                        1
                      </span>
                      <h4 className="font-semibold text-heading flex items-center gap-2">
                        <CreditCardIcon className="w-5 h-5 text-primary-500" />
                        {locale === "en"
                          ? "Card Information"
                          : "Kart Bilgileri"}
                      </h4>
                    </div>

                    <div className="p-4 bg-surface border border-border rounded-lg">
                      {savedCards.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-body mb-3">
                            {locale === "en"
                              ? "My Saved Cards"
                              : "Kayıtlı Kartlarım"}
                          </p>
                          <div className="space-y-2">
                            {savedCards.map((card) => (
                              <label
                                key={card.id}
                                className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                  !useNewCard && selectedSavedCard === card.id
                                    ? "border-primary-500 bg-primary-50"
                                    : "border-border hover:border-border"
                                }`}
                              >
                                <Radio
                                  name="tradeCard"
                                  checked={
                                    !useNewCard && selectedSavedCard === card.id
                                  }
                                  onChange={() => {
                                    setSelectedSavedCard(card.id);
                                    setUseNewCard(false);
                                  }}
                                  className="text-primary-500"
                                />
                                <div className="flex-1">
                                  <p className="font-medium text-heading">
                                    {card.cardBrand} •••• {card.lastFour}
                                  </p>
                                  <p className="text-sm text-muted">
                                    {card.expiryMonth
                                      .toString()
                                      .padStart(2, "0")}
                                    /{card.expiryYear}
                                  </p>
                                </div>
                                {card.isDefault && (
                                  <span className="text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded-sm">
                                    {locale === "en" ? "Default" : "Varsayılan"}
                                  </span>
                                )}
                              </label>
                            ))}
                            <label
                              className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                useNewCard
                                  ? "border-primary-500 bg-primary-50"
                                  : "border-border hover:border-border"
                              }`}
                            >
                              <Radio
                                name="tradeCard"
                                checked={useNewCard}
                                onChange={() => setUseNewCard(true)}
                                className="text-primary-500"
                              />
                              <div className="flex items-center gap-2">
                                <PlusIcon className="w-5 h-5 text-muted" />
                                <span className="font-medium text-heading">
                                  {locale === "en"
                                    ? "Pay with New Card"
                                    : "Yeni Kart ile Öde"}
                                </span>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}

                      {(savedCards.length === 0 || useNewCard) && (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-body mb-1">
                              {locale === "en"
                                ? "Name on Card"
                                : "Kart Üzerindeki İsim"}
                            </label>
                            <Input
                              type="text"
                              value={cardName}
                              onChange={(e) =>
                                setCardName(e.target.value.toUpperCase())
                              }
                              placeholder="AD SOYAD"
                              className="h-12 px-4"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-body mb-1">
                              {locale === "en"
                                ? "Card Number"
                                : "Kart Numarası"}
                            </label>
                            <Input
                              type="text"
                              value={cardNumber}
                              onChange={(e) => {
                                setCardError(null);
                                const value = e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 16);
                                const formatted = value.replace(
                                  /(\d{4})(?=\d)/g,
                                  "$1 ",
                                );
                                setCardNumber(formatted);
                              }}
                              placeholder="4508 3456 7890 1234"
                              className="h-12 px-4 font-mono"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-body mb-1">
                                {locale === "en"
                                  ? "Expiry Date"
                                  : "Son Kullanma Tarihi"}
                              </label>
                              <Input
                                type="text"
                                value={cardExpiry}
                                onChange={(e) => {
                                  const value = e.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 4);
                                  if (value.length >= 2) {
                                    setCardExpiry(
                                      value.slice(0, 2) + "/" + value.slice(2),
                                    );
                                  } else {
                                    setCardExpiry(value);
                                  }
                                }}
                                placeholder="AA/YY"
                                maxLength={5}
                                className="h-12 px-4 font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-body mb-1">
                                CVV/CVC
                              </label>
                              <Input
                                type="password"
                                value={cardCvc}
                                onChange={(e) =>
                                  setCardCvc(
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 3),
                                  )
                                }
                                placeholder="•••"
                                maxLength={3}
                                className="h-12 px-4 font-mono"
                              />
                            </div>
                          </div>
                          <Checkbox
                            checked={saveCard}
                            onChange={(e) => setSaveCard(e.target.checked)}
                            label={
                              locale === "en"
                                ? "Save this card for future purchases"
                                : "Bu kartı gelecekteki alışverişlerim için kaydet"
                            }
                          />
                        </div>
                      )}

                      {!useNewCard && selectedSavedCard && (
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-body mb-1">
                            CVV/CVC (
                            {locale === "en"
                              ? "Re-enter for security"
                              : "Güvenlik için tekrar girin"}
                            )
                          </label>
                          <Input
                            type="password"
                            value={cardCvc}
                            onChange={(e) =>
                              setCardCvc(
                                e.target.value.replace(/\D/g, "").slice(0, 3),
                              )
                            }
                            placeholder="•••"
                            maxLength={3}
                            className="w-32 h-12 px-4 font-mono"
                          />
                        </div>
                      )}

                      <div className="mt-4 flex items-center gap-2 text-xs text-muted">
                        <ShieldCheckIcon className="w-4 h-4 text-success-500" />
                        {locale === "en"
                          ? "256-bit SSL encrypted secure payment"
                          : "256-bit SSL ile şifrelenmiş güvenli ödeme"}
                      </div>
                    </div>
                  </div>

                  {/* Pay Button */}
                  <Button
                    variant="success"
                    size="lg"
                    className="w-full flex items-center justify-center gap-2 text-base"
                    onClick={handleCashPayment}
                    disabled={cashPaymentLoading}
                  >
                    <ShieldCheckIcon className="w-5 h-5" />
                    {cashPaymentLoading
                      ? locale === "en"
                        ? "Processing..."
                        : "İşleniyor..."
                      : `${locale === "en" ? "Pay" : "Ödeme Yap"} – ${(trade.cashPayment?.totalAmount ?? trade.cashAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`}
                  </Button>
                </div>
              )}
          </div>
        )}

        {/* Kargo Bilgisi Gir - adres ve kargo firması seçimi */}
        {needToShip && (
          <div className="card p-6 mb-6 bg-primary-50 border-primary-200">
            <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
              <TruckIcon className="w-5 h-5 text-primary-600" />
              {locale === "en" ? "Enter Shipping Info" : "Kargo Bilgisi Gir"}
            </h2>
            <p className="text-muted text-sm mb-4">
              {locale === "en"
                ? "Select the address you will ship from and the carrier."
                : "Gönderim yapacağınız adresi ve kargo firmasını seçin."}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === "en" ? "Shipping address" : "Gönderim adresi"}
                </label>
                <Select
                  value={shipAddressId}
                  onChange={(e) => setShipAddressId(e.target.value)}
                  className="rounded-xl"
                >
                  <option value="">
                    {addressesQuery.isLoading
                      ? locale === "en"
                        ? "Loading..."
                        : "Yükleniyor..."
                      : locale === "en"
                        ? "Select address"
                        : "Adres seçin"}
                  </option>
                  {addresses.map((addr: any) => (
                    <option key={addr.id} value={addr.id}>
                      {addr.fullName || addr.title} – {addr.city} /{" "}
                      {addr.district} {addr.address ? `– ${addr.address}` : ""}
                    </option>
                  ))}
                </Select>
                {addresses.length === 0 && !addressesQuery.isLoading && (
                  <p className="text-sm text-warning-600 mt-2">
                    {locale === "en"
                      ? "No saved addresses. Add one in "
                      : "Kayıtlı adres yok. "}
                    <Link
                      href="/profile/addresses"
                      className="underline font-medium"
                    >
                      {locale === "en"
                        ? "Profile → Addresses"
                        : "Profil → Adresler"}
                    </Link>
                    {locale === "en" ? "" : " bölümünden ekleyebilirsiniz."}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === "en" ? "Carrier" : "Kargo firması"}
                </label>
                <Select
                  value={shipCarrier}
                  onChange={(e) => setShipCarrier(e.target.value)}
                  className="rounded-xl"
                >
                  <option value="aras">Aras Kargo</option>
                  <option value="yurtici">Yurtiçi Kargo</option>
                  <option value="mng">MNG Kargo</option>
                </Select>
              </div>
              <Button
                variant="primary"
                size="lg"
                className="w-full flex items-center justify-center gap-2"
                onClick={handleShipSubmit}
                disabled={
                  isActionLoading || !shipAddressId || addresses.length === 0
                }
              >
                {isActionLoading ? (
                  <>
                    <Spinner
                      size="sm"
                      color="border-surface-elevated border-t-transparent"
                    />
                    {locale === "en" ? "Submitting..." : "Gönderiliyor..."}
                  </>
                ) : (
                  <>
                    <TruckIcon className="w-5 h-5" />
                    {locale === "en"
                      ? "Submit Shipping Info"
                      : "Kargo Bilgisini Gönder"}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Ship to warehouse form (safe-trade escrow flow) */}
        {trade.status === "shipping_to_warehouse" &&
          user &&
          (user.id === trade.initiatorId || user.id === trade.receiverId) && (
            <div className="card p-6 mb-6 bg-primary-50 border-primary-200">
              <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                <TruckIcon className="w-5 h-5 text-primary-600" />
                {locale === "en"
                  ? "Ship to Tarodan Warehouse"
                  : "Tarodan Deposuna Gönder"}
              </h2>

              {/* Both parties shipment status */}
              <div className="mb-4 p-3 bg-surface-elevated/70 rounded-lg text-sm text-body">
                <p>
                  <span className="font-medium">
                    {locale === "en" ? "You: " : "Siz: "}
                  </span>
                  {myWarehouseShipped
                    ? locale === "en"
                      ? "Shipped"
                      : "Gönderildi"
                    : locale === "en"
                      ? "Pending"
                      : "Bekleniyor"}
                  {" · "}
                  <span className="font-medium">
                    {locale === "en" ? "Other party: " : "Karşı taraf: "}
                  </span>
                  {otherWarehouseShipped
                    ? locale === "en"
                      ? "Shipped"
                      : "Gönderildi"
                    : locale === "en"
                      ? "Pending"
                      : "Bekleniyor"}
                </p>
              </div>

              <div className="mb-4 p-3 bg-info-50 border border-info-200 rounded-lg">
                <p className="text-sm text-info-900">{warehouseProgressText}</p>
              </div>

              {myWarehouseShipped ? (
                <div className="flex items-center gap-3 p-3 bg-surface-elevated rounded-lg border border-primary-200">
                  <CheckCircleIcon className="w-5 h-5 text-success-600" />
                  <div className="text-sm text-body">
                    <p className="font-medium">
                      {locale === "en"
                        ? "Your shipping info is saved"
                        : "Kargo bilginiz kaydedildi"}
                    </p>
                    {((myToWarehouseShipment?.carrier ||
                      fallbackMyWarehouseShipment?.carrier) ||
                      (myToWarehouseShipment?.trackingNumber ||
                        fallbackMyWarehouseShipment?.trackingNumber)) && (
                      <p className="text-xs text-muted mt-1">
                        {myToWarehouseShipment?.carrier ||
                          fallbackMyWarehouseShipment?.carrier}
                        {(myToWarehouseShipment?.trackingNumber ||
                          fallbackMyWarehouseShipment?.trackingNumber)
                          ? ` · ${
                              myToWarehouseShipment?.trackingNumber ||
                              fallbackMyWarehouseShipment?.trackingNumber
                            }`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-muted text-sm mb-4">
                    {locale === "en"
                      ? "Select the address you will ship from and the carrier. Items will be reviewed at our warehouse."
                      : "Gönderim yapacağınız adresi ve kargo firmasını seçin. Ürünler depomuzda incelenecek."}
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-body mb-2">
                        {locale === "en"
                          ? "Shipping address"
                          : "Gönderim adresi"}
                      </label>
                      <Select
                        value={shipAddressId}
                        onChange={(e) => setShipAddressId(e.target.value)}
                        className="rounded-xl"
                      >
                        <option value="">
                          {addressesQuery.isLoading
                            ? locale === "en"
                              ? "Loading..."
                              : "Yükleniyor..."
                            : locale === "en"
                              ? "Select address"
                              : "Adres seçin"}
                        </option>
                        {addresses.map((addr: any) => (
                          <option key={addr.id} value={addr.id}>
                            {addr.fullName || addr.title} – {addr.city} /{" "}
                            {addr.district}{" "}
                            {addr.address ? `– ${addr.address}` : ""}
                          </option>
                        ))}
                      </Select>
                      {addresses.length === 0 && !addressesQuery.isLoading && (
                        <p className="text-sm text-warning-600 mt-2">
                          {locale === "en"
                            ? "No saved addresses. Add one in "
                            : "Kayıtlı adres yok. "}
                          <Link
                            href="/profile/addresses"
                            className="underline font-medium"
                          >
                            {locale === "en"
                              ? "Profile → Addresses"
                              : "Profil → Adresler"}
                          </Link>
                          {locale === "en"
                            ? ""
                            : " bölümünden ekleyebilirsiniz."}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-body mb-2">
                        {locale === "en" ? "Carrier" : "Kargo firması"}
                      </label>
                      <Select
                        value={shipCarrier}
                        onChange={(e) => setShipCarrier(e.target.value)}
                        className="rounded-xl"
                      >
                        <option value="aras">Aras Kargo</option>
                        <option value="yurtici">Yurtiçi Kargo</option>
                        <option value="mng">MNG Kargo</option>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-body mb-2">
                        {locale === "en"
                          ? "Tracking number (optional)"
                          : "Takip numarası (opsiyonel)"}
                      </label>
                      <Input
                        type="text"
                        value={shipTrackingNumber}
                        onChange={(e) => setShipTrackingNumber(e.target.value)}
                        placeholder={
                          locale === "en"
                            ? "e.g. 1234567890"
                            : "örn. 1234567890"
                        }
                        className="h-12 px-4 rounded-xl"
                      />
                    </div>
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full flex items-center justify-center gap-2"
                      onClick={handleShipToWarehouseSubmit}
                      disabled={
                        isActionLoading ||
                        !shipAddressId ||
                        addresses.length === 0
                      }
                    >
                      {isActionLoading ? (
                        <>
                          <Spinner
                            size="sm"
                            color="border-surface-elevated border-t-transparent"
                          />
                          {locale === "en"
                            ? "Submitting..."
                            : "Gönderiliyor..."}
                        </>
                      ) : (
                        <>
                          <TruckIcon className="w-5 h-5" />
                          {locale === "en"
                            ? "Ship to Warehouse"
                            : "Depoya Gönder"}
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

        {/* Shipping to recipients (admin approved; confirm-receipt) */}
        {trade.status === "shipping_to_recipients" &&
          user &&
          (user.id === trade.initiatorId || user.id === trade.receiverId) && (
            <div className="card p-6 mb-6 bg-info-50 border-info-200">
              <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                <TruckIcon className="w-5 h-5 text-info-600" />
                {locale === "en"
                  ? "Your Shipment is on the Way"
                  : "Kargonuz Yolda"}
              </h2>

              {myFromWarehouseShipment ? (
                <div className="p-4 bg-surface-elevated rounded-lg border border-info-200 mb-4">
                  <p className="text-sm text-muted mb-1">
                    {locale === "en"
                      ? "Shipped to you"
                      : "Size gönderilen kargo"}
                  </p>
                  <p className="font-medium text-heading">
                    {myFromWarehouseShipment.carrier || "—"}
                    {myFromWarehouseShipment.trackingNumber
                      ? ` · ${myFromWarehouseShipment.trackingNumber}`
                      : ""}
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-surface-elevated rounded-lg border border-info-200 mb-4">
                  <p className="text-sm text-muted">
                    {locale === "en"
                      ? "Tracking info will be available shortly."
                      : "Takip bilgileri kısa süre içinde görünecek."}
                  </p>
                </div>
              )}

              {otherFromWarehouseShipment && (
                <div className="p-3 bg-surface-elevated/70 rounded-lg border border-info-100 mb-4 text-sm text-muted">
                  <p className="font-medium text-body mb-0.5">
                    {locale === "en"
                      ? "Other party's shipment"
                      : "Karşı tarafın kargosu"}
                  </p>
                  <p>
                    {otherFromWarehouseShipment.carrier || "—"}
                    {otherFromWarehouseShipment.trackingNumber
                      ? ` · ${otherFromWarehouseShipment.trackingNumber}`
                      : ""}
                  </p>
                </div>
              )}

              <Button
                variant="success"
                size="lg"
                className="w-full flex items-center justify-center gap-2"
                onClick={handleConfirmReceipt}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <>
                    <Spinner
                      size="sm"
                      color="border-surface-elevated border-t-transparent"
                    />
                    {locale === "en" ? "Processing..." : "İşleniyor..."}
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-5 h-5" />
                    {locale === "en" ? "I Received It" : "Teslim Aldım"}
                  </>
                )}
              </Button>
            </div>
          )}

        {/* Return shipment info */}
        {trade.status === "returning" && myReturnShipment && (
          <div className="card p-6 mb-6 bg-warning-50 border-warning-200">
            <h3 className="font-semibold text-warning-900 mb-2 flex items-center gap-2">
              <TruckIcon className="w-5 h-5" />
              {locale === "en" ? "Return Shipment" : "İade Kargosu"}
            </h3>
            <p className="text-sm text-body">
              {myReturnShipment.carrier || "—"}
              {myReturnShipment.trackingNumber
                ? ` · ${myReturnShipment.trackingNumber}`
                : ""}
            </p>
          </div>
        )}

        {/* Messages */}
        {(trade.initiatorMessage || trade.receiverMessage) && (
          <div className="card p-6 mb-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <ChatBubbleLeftRightIcon className="w-5 h-5" />
              Mesajlar
            </h3>
            <div className="space-y-4">
              {trade.initiatorMessage && (
                <div>
                  <p className="text-sm font-medium text-body mb-1">
                    {trade.initiatorName}:
                  </p>
                  <p className="text-muted">{trade.initiatorMessage}</p>
                </div>
              )}
              {trade.receiverMessage && (
                <div>
                  <p className="text-sm font-medium text-body mb-1">
                    {trade.receiverName}:
                  </p>
                  <p className="text-muted">{trade.receiverMessage}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Shipment Info */}
        {(trade.initiatorShipment || trade.receiverShipment) && (
          <div className="card p-6 mb-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TruckIcon className="w-5 h-5" />
              Kargo Bilgileri
            </h3>
            <div className="space-y-4">
              {trade.initiatorShipment && (
                <div>
                  <p className="text-sm font-medium text-body mb-1">
                    {trade.initiatorName}:
                  </p>
                  <p className="text-muted">
                    {trade.initiatorShipment.carrier} -{" "}
                    {trade.initiatorShipment.trackingNumber}
                  </p>
                </div>
              )}
              {trade.receiverShipment && (
                <div>
                  <p className="text-sm font-medium text-body mb-1">
                    {trade.receiverName}:
                  </p>
                  <p className="text-muted">
                    {trade.receiverShipment.carrier} -{" "}
                    {trade.receiverShipment.trackingNumber}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {(canAccept || canReject || canCounter || canCancel) && (
          <div className="card p-6">
            <div className="flex flex-wrap gap-3">
              {canAccept && (
                <Button
                  variant="success"
                  size="lg"
                  className="flex-1 min-w-[120px]"
                  onClick={handleAccept}
                  disabled={isActionLoading}
                >
                  {isActionLoading
                    ? locale === "en"
                      ? "Processing..."
                      : "İşleniyor..."
                    : locale === "en"
                      ? "Accept"
                      : "Kabul Et"}
                </Button>
              )}
              {canCounter && (
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1 min-w-[120px]"
                  onClick={handleOpenCounterModal}
                  disabled={isActionLoading}
                >
                  {locale === "en" ? "Counter Offer" : "Karşı Teklif"}
                </Button>
              )}
              {canReject && (
                <Button
                  variant="secondary"
                  size="lg"
                  className="flex-1 min-w-[120px]"
                  onClick={() => setShowRejectModal(true)}
                  disabled={isActionLoading}
                >
                  {locale === "en" ? "Reject" : "Reddet"}
                </Button>
              )}
              {canCancel && !canAccept && !canReject && (
                <Button
                  variant="danger"
                  size="lg"
                  className="flex-1 min-w-[120px]"
                  onClick={handleCancel}
                  disabled={isActionLoading}
                >
                  {locale === "en" ? "Cancel Trade" : "İptal Et"}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Reject Modal */}
        <Modal
          isOpen={showRejectModal}
          onClose={() => {
            setShowRejectModal(false);
            setRejectReason("");
          }}
          title={locale === "en" ? "Reject Trade" : "Takası Reddet"}
          maxWidth="max-w-md"
        >
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={
              locale === "en"
                ? "Rejection reason (optional)"
                : "Red nedeni (opsiyonel)"
            }
            rows={4}
            className="mb-4"
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={() => {
                setShowRejectModal(false);
                setRejectReason("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              size="md"
              className="flex-1"
              onClick={handleReject}
              disabled={isActionLoading}
            >
              {isActionLoading
                ? locale === "en"
                  ? "Rejecting..."
                  : "Reddediliyor..."
                : locale === "en"
                  ? "Reject"
                  : "Reddet"}
            </Button>
          </div>
        </Modal>
      </div>
    </div>
  );
}
