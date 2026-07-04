"use client";

import { ButtonLink } from "@/components/ui/ButtonLink";
import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";
import {
  api,
  paymentsApi,
  addressesApi,
  ratingsApi,
  mediaApi,
  supportApi,
} from "@/lib/api";
import RefundRequestModal from "@/components/RefundRequestModal";
import {
  ArrowLeftIcon,
  TruckIcon,
  MapPinIcon,
  CreditCardIcon,
  ArrowUturnLeftIcon,
  TagIcon,
  CheckIcon,
  PlusIcon,
  ShieldCheckIcon,
  XCircleIcon,
  StarIcon as StarOutlineIcon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "@/i18n/LanguageContext";
import { useConfirm } from "@/components/ConfirmProvider";
import CityDistrictSelector from "@/components/CityDistrictSelector";
import UserAvatar from "@/components/UserAvatar";
import {
  Button,
  Input,
  Modal,
  Radio,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  orderStatusConfig,
} from "@tarodan/ui";

interface OrderDetail {
  id: string;
  orderNumber: string;
  isMembership?: boolean;
  status: string;
  /** 'iptal' (kargo öncesi) | 'iade' (kargo sonrası). 'iptal' ise UI "İade" yerine "İptal" gösterir. */
  cancellationType?: string | null;
  totalAmount: number;
  amount: number;
  commissionAmount: number;
  shippingCost?: number;
  buyerFeeAmount?: number;
  sellerFeeAmount?: number;
  pricing?: {
    subtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    taxAmount?: number;
    withholdingTaxAmount?: number;
    totalAmount: number;
    sellerNetAmount: number;
  };
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string | null;
  product: {
    id: string;
    title: string;
    imageUrl?: string;
    status: string;
  } | null;
  items?: Array<{
    id: string;
    product: {
      id: string;
      title: string;
      imageUrl?: string;
    };
    quantity: number;
    price: number;
  }>;
  buyer: {
    id: string;
    displayName: string;
    isVerified?: boolean;
    avatarUrl?: string;
  };
  seller: {
    id: string;
    displayName: string;
    isVerified?: boolean;
    avatarUrl?: string;
  };
  shippingAddress?: {
    id: string;
    title: string;
    addressLine1: string;
    addressLine2?: string;
    district: string;
    city: string;
    postalCode: string;
  };
  shipment?: {
    id: string;
    provider: string;
    trackingNumber: string | null;
    status: string;
    cost?: number;
  };
  activeRefundRequest?: {
    id: string;
    refundNumber: string;
    status: string;
    reason?: string;
    returnTrackingNumber?: string | null;
    returnProvider?: string | null;
    returnStatus?: string | null;
    createdAt: string;
    refundedAt?: string | null;
  } | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  cancelCategory?: string | null;
  canReactivate?: boolean;
  isBuyer: boolean;
  isSeller: boolean;
  hasProductRating?: boolean;
  hasSellerRating?: boolean;
  offerId?: string;
  payment?: {
    id: string;
    status: string;
    amount: number;
    provider: string;
    failureReason?: string | null;
  };
}

const orderStatusEnLabels: Record<string, string> = {
  pending_payment: "Awaiting Payment",
  paid: "Paid",
  preparing: "Preparing",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refund_requested: "Refund Requested",
  refunded: "Refunded",
};

// İptal kartında gösterilecek kullanıcı dostu açıklama. Backend stabil bir
// cancelCategory döner; bilinmeyen/serbest-metin sebepler ham haliyle gösterilir.
function getCancelMessage(
  category: string | null | undefined,
  isBuyer: boolean,
  rawReason: string | null | undefined,
  locale: string,
): string | null {
  const en = locale === "en";
  switch (category) {
    case "buyer_cancelled":
      return isBuyer
        ? en
          ? "You cancelled this order."
          : "Bu siparişi iptal ettiniz."
        : en
          ? "The buyer cancelled this order."
          : "Alıcı bu siparişi iptal etti.";
    case "payment_timeout":
      return en
        ? "This order was automatically cancelled because payment wasn't completed within 24 hours."
        : "Ödeme 24 saat içinde tamamlanmadığı için sipariş otomatik iptal edildi.";
    case "seller_no_ship":
      // İade durumu cümlesi BİLEREK yok: aşağıdaki ayrı iade bloğu (refunded →
      // "iade edilmiştir", completed → "aktarılacaktır") tek kaynak. Burada da
      // "iade edilecektir" dersek ikisi yan yana çıkıp çelişiyordu.
      return en
        ? "The seller didn't ship within the allowed time, so the order was cancelled."
        : "Satıcı siparişi süresinde kargoya vermediği için iptal edildi.";
    case "stockout":
      return en
        ? "This order was cancelled because the product is out of stock."
        : "Ürün stoğu tükendiği için bu sipariş iptal edildi.";
    case "trade_reserved":
      return en
        ? "This order was cancelled because the product was reserved for a trade."
        : "Ürün bir takas işlemi için ayrıldığından bu sipariş iptal edildi.";
    case "bulk_replaced":
      return en
        ? "This order was merged into a new combined order."
        : "Bu sipariş yeni bir toplu sipariş ile birleştirildi.";
    case "admin_buyer_favor":
      return en
        ? "This order was cancelled in your favor by our support team."
        : "Bu sipariş sizin lehinize destek ekibimiz tarafından iptal edildi.";
    case "admin":
      return en
        ? "This order was cancelled by our support team."
        : "Bu sipariş destek ekibimiz tarafından iptal edildi.";
    default:
      // other / bilinmeyen: admin'in yazdığı serbest metni ham haliyle göster
      return rawReason && rawReason.trim() ? rawReason : null;
  }
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const { t, locale } = useTranslation();
  const confirm = useConfirm();
  const getOrderStatusLabel = (s: string) =>
    locale === "en"
      ? orderStatusEnLabels[s] || s
      : orderStatusConfig[s]?.label || s;
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState<number | undefined>(
    undefined,
  );
  const [processingRefund, setProcessingRefund] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  // eLogo e-Arşiv (gerçek yasal fatura) — yalnız HAZIRSA buton çıkar.
  const [elogoInvoice, setElogoInvoice] = useState<{
    id: string;
    invoiceNumber: string;
    label?: string;
  } | null>(null);
  // Kurumsal satıcının siparişe ELLE yüklediği ürün faturası (eLogo gelir faturasından ayrı).
  const [sellerInvoice, setSellerInvoice] = useState<{
    invoice: { id: string; fileName: string; uploadedAt: string } | null;
    canUpload: boolean;
    isSeller: boolean;
    isBuyer: boolean;
  } | null>(null);
  const [uploadingSellerInvoice, setUploadingSellerInvoice] = useState(false);
  const [downloadingSellerInvoice, setDownloadingSellerInvoice] = useState(false);
  const sellerInvoiceInputRef = useRef<HTMLInputElement>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );
  const [addressesFetched, setAddressesFetched] = useState(false);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState({
    fullName: "",
    phone: "",
    city: "",
    district: "",
    address: "",
    zipCode: "",
  });


  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewScore, setReviewScore] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [sellerCommunication, setSellerCommunication] = useState(5);
  const [sellerShipping, setSellerShipping] = useState(5);
  const [sellerPackaging, setSellerPackaging] = useState(5);
  const [sellerReviewText, setSellerReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewImages, setReviewImages] = useState<File[]>([]);
  const [reviewImagePreviews, setReviewImagePreviews] = useState<string[]>([]);
  const [refundReason, setRefundReason] = useState("");
  const [refundDescription, setRefundDescription] = useState("");
  const [refundImages, setRefundImages] = useState<File[]>([]);
  const [refundImagePreviews, setRefundImagePreviews] = useState<string[]>([]);
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const orderId = params?.id as string;

  // No programmatic redirect to login (like cart page). Auth done: show order or "please log in" with link.
  const orderQuery = useQuery({
    queryKey: ["order", orderId],
    queryFn: async (): Promise<OrderDetail> => {
      const response = await api.get(`/orders/${orderId}`);
      const data = response.data?.data ?? response.data;
      if (!data || typeof data !== "object" || data.status === undefined) {
        throw new Error("Invalid order response");
      }
      return data as OrderDetail;
    },
    enabled: !!orderId && !authLoading && !!isAuthenticated,
    meta: { page: "order-detail" },
    retry: false,
  });
  const rawOrder = orderQuery.data;
  const order =
    rawOrder && typeof rawOrder === "object" && rawOrder.status !== undefined
      ? rawOrder
      : null;
  const loading = orderQuery.isLoading;
  useEffect(() => {
    if (orderQuery.isError && orderId) {
      toast.error(
        locale === "en" ? "Failed to load order" : "Sipariş yüklenemedi",
      );
      router.push("/orders");
    }
  }, [orderQuery.isError, orderId, locale, router]);

  // eLogo e-Arşiv (gerçek yasal fatura) hazır mı? Hazırsa "Faturayı İndir" çıkar.
  useEffect(() => {
    if (!orderId || !order || order.status === "pending_payment" || order.status === "cancelled") {
      setElogoInvoice(null);
      return;
    }
    let cancelled = false;
    api
      .get(`/elogo/invoices/by-order/${orderId}`)
      .then((res) => {
        if (!cancelled) setElogoInvoice(res.data || null);
      })
      .catch(() => {
        if (!cancelled) setElogoInvoice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, order?.status]);

  // Kurumsal satıcı faturası durumu (yükleme yetkisi + yüklenmiş fatura).
  const fetchSellerInvoice = () => {
    if (!orderId || !order || order.status === "pending_payment" || order.status === "cancelled") {
      setSellerInvoice(null);
      return;
    }
    api
      .get(`/orders/${orderId}/seller-invoice`)
      .then((res) => setSellerInvoice(res.data || null))
      .catch(() => setSellerInvoice(null));
  };
  useEffect(() => {
    fetchSellerInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, order?.status]);

  const invalidateOrder = () =>
    queryClient
      .invalidateQueries({ queryKey: ["order", orderId] })
      .then(() => queryClient.invalidateQueries({ queryKey: ["orders"] }));

  // Üyelik/dijital siparişler (sanal ürün + platform satıcısı, "MEM-" sipariş no) fiziksel
  // ürün gibi davranmaz: yorum/iade/teslimat adresi/kargo aksiyonları gösterilmez.
  const isMembershipOrder = (o: OrderDetail) =>
    o.isMembership ?? o.orderNumber?.startsWith("MEM-") ?? false;
  const REVIEWABLE_STATUSES = ["completed", "delivered"];
  const canReview = (o: OrderDetail) =>
    o.isBuyer &&
    !isMembershipOrder(o) &&
    REVIEWABLE_STATUSES.includes(o.status) &&
    (o.hasProductRating === false || o.hasSellerRating === false);
  const openReviewModal = () => {
    setReviewScore(5);
    setReviewTitle("");
    setReviewText("");
    setSellerCommunication(5);
    setSellerShipping(5);
    setSellerPackaging(5);
    setSellerReviewText("");
    setReviewImages([]);
    setReviewImagePreviews([]);
    setShowReviewModal(true);
  };
  const handleReviewImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxFiles = 5;
    const remaining = maxFiles - reviewImages.length;
    const newFiles = files.slice(0, remaining);
    if (newFiles.length === 0) return;
    setReviewImages((prev) => [...prev, ...newFiles]);
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setReviewImagePreviews((prev) => [
          ...prev,
          ev.target?.result as string,
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };
  const removeReviewImage = (index: number) => {
    setReviewImages((prev) => prev.filter((_, i) => i !== index));
    setReviewImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };
  const submitReview = async () => {
    if (!order) return;
    const productId = order.product?.id || order.items?.[0]?.product?.id;
    const sellerId = order.seller?.id;
    if (!productId) {
      toast.error(t("order.orderNotFound"));
      return;
    }
    setSubmittingReview(true);
    try {
      // Upload review images first
      let imageUrls: string[] = [];
      if (reviewImages.length > 0) {
        const uploadPromises = reviewImages.map((file) =>
          mediaApi.uploadReviewImage(file),
        );
        const results = await Promise.all(uploadPromises);
        imageUrls = results.map((r) => r.data?.url).filter(Boolean) as string[];
      }
      await ratingsApi.createProductRating({
        productId,
        orderId: order.id,
        score: reviewScore,
        title: reviewTitle || undefined,
        review: reviewText || undefined,
        images: imageUrls.length > 0 ? imageUrls : undefined,
      });
      if (sellerId) {
        const avgSellerScore = Math.round(
          (sellerCommunication + sellerShipping + sellerPackaging) / 3,
        );
        const scoreBreakdown = `İletişim: ${sellerCommunication}/5, Kargo: ${sellerShipping}/5, Paketleme: ${sellerPackaging}/5`;
        const fullComment = sellerReviewText
          ? `${sellerReviewText}\n\n${scoreBreakdown}`
          : scoreBreakdown;
        await ratingsApi.createUserRating({
          receiverId: sellerId,
          orderId: order.id,
          score: avgSellerScore,
          comment: fullComment,
        });
      }
      toast.success(t("review.reviewSubmitted"));
      setShowReviewModal(false);
      await invalidateOrder();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Review submit error:", error);
      toast.error(
        (error as any)?.response?.data?.message || t("common.operationFailed"),
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  const hasShippingAddress = !!(
    order?.shippingAddress && (order.shippingAddress as any).city
  );
  const isPendingPaymentBuyer =
    order?.isBuyer && order?.status === "pending_payment";

  useEffect(() => {
    if (!isPendingPaymentBuyer) return;

    if (!addressesFetched) {
      addressesApi
        .getAll()
        .then((res) => {
          const addrs = Array.isArray(res.data?.data)
            ? res.data.data
            : Array.isArray(res.data)
              ? res.data
              : [];
          setSavedAddresses(addrs);
          if (addrs.length === 0) {
            setShowNewAddressForm(true);
          } else {
            const currentOrder = order;
            const orderAddr =
              currentOrder?.shippingAddress != null &&
              typeof currentOrder.shippingAddress === "object"
                ? (currentOrder.shippingAddress as any)
                : null;
            const match =
              orderAddr?.city &&
              addrs.find(
                (a: any) =>
                  a.city === orderAddr.city &&
                  a.district === orderAddr.district &&
                  (a.address === orderAddr.addressLine1 ||
                    a.address === orderAddr.address),
              );
            const defaultAddr = addrs.find((a: any) => a.isDefault);
            if (match) setSelectedAddressId(match.id);
            else if (defaultAddr) setSelectedAddressId(defaultAddr.id);
            else if (addrs[0]?.id) setSelectedAddressId(addrs[0].id);
          }
          setAddressesFetched(true);
        })
        .catch(() => {
          setAddressesFetched(true);
          setShowNewAddressForm(true);
        });
    }

  }, [
    isPendingPaymentBuyer,
    addressesFetched,
    hasShippingAddress,
    order,
  ]);

  const handleSetAddressAndPay = async () => {
    if (!order) return;
    setAddressLoading(true);

    let addrPayload: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };

    if (showNewAddressForm) {
      if (
        !newAddress.fullName ||
        !newAddress.phone ||
        !newAddress.city ||
        !newAddress.district ||
        !newAddress.address
      ) {
        toast.error(
          locale === "en"
            ? "Please fill all required fields"
            : "Lütfen tüm zorunlu alanları doldurun",
        );
        setAddressLoading(false);
        return;
      }
      addrPayload = {
        fullName: newAddress.fullName,
        phone: newAddress.phone,
        city: newAddress.city,
        district: newAddress.district,
        address: newAddress.address,
        zipCode: newAddress.zipCode || undefined,
      };
      try {
        await addressesApi.create({
          ...addrPayload,
          title: newAddress.fullName,
          isDefault: savedAddresses.length === 0,
        });
      } catch {
        // Non-critical: address may already exist or user might not want to save
      }
    } else {
      if (!selectedAddressId) return;
      const addr = savedAddresses.find((a: any) => a.id === selectedAddressId);
      if (!addr) return;
      addrPayload = {
        fullName: addr.fullName,
        phone: addr.phone,
        city: addr.city,
        district: addr.district,
        address: addr.address,
        zipCode: addr.zipCode || undefined,
      };
    }

    try {
      await api.patch(`/orders/${order.id}/shipping-address`, addrPayload);
      await invalidateOrder();
      handleInitiatePayment();
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          (locale === "en" ? "Failed to set address" : "Adres kaydedilemedi"),
      );
      setAddressLoading(false);
    }
  };

  const handleInitiatePayment = async () => {
    if (!order) return;
    setPaymentLoading(true);
    try {
      const res = await paymentsApi.initiate(order.id, "paytr");
      const data = res.data?.data ?? res.data;

      // Bypass mode: complete payment instantly without PayTR
      if (data?.useBypass && data?.paymentId) {
        try {
          const bypassRes = await paymentsApi.bypassComplete(data.paymentId);
          if (bypassRes.data?.success) {
            toast.success(
              locale === "en" ? "Payment successful" : "Ödeme başarılı",
            );
            router.push(`/payment/success?paymentId=${data.paymentId}`);
          } else {
            toast.error(locale === "en" ? "Payment failed" : "Ödeme başarısız");
            router.push(`/payment/fail?paymentId=${data.paymentId}`);
          }
        } catch (err: any) {
          toast.error(
            err.response?.data?.message ||
              (locale === "en" ? "Payment failed" : "Ödeme başarısız"),
          );
        }
        setPaymentLoading(false);
        setAddressLoading(false);
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
      setPaymentLoading(false);
      setAddressLoading(false);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          (locale === "en"
            ? "Payment initiation failed"
            : "Ödeme başlatılamadı"),
      );
      setPaymentLoading(false);
      setAddressLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      if (newStatus === "completed") {
        await api.post(`/orders/${orderId}/confirm`);
      } else if (newStatus === "preparing") {
        await api.post(`/orders/${orderId}/prepare`);
      } else {
        toast.error(
          locale === "en" ? "Unsupported status" : "Desteklenmeyen durum",
        );
        return;
      }
      toast.success(
        locale === "en" ? "Order status updated" : "Sipariş durumu güncellendi",
      );
      await invalidateOrder();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          (locale === "en"
            ? "Failed to update status"
            : "Durum güncellenemedi"),
      );
    }
  };

  const handleRefund = () => {
    if (!order) return;
    if (order.status === "pending_payment") {
      toast(
        locale === "en"
          ? "This order is not paid; cancel it instead"
          : "Bu sipariş henüz ödenmemiş, iptal etmelisiniz",
      );
      return;
    }
    setShowRefundModal(true);
  };

  const inferRefundPhase = (): "preparing" | "in_cooling_off" | "past_cooling_off" => {
    if (!order) return "preparing";
    const shipmentStatus = order.shipment?.status;
    if (
      (order.status === "paid" || order.status === "preparing") &&
      (!shipmentStatus || shipmentStatus === "pending")
    ) {
      return "preparing";
    }
    if (isPastRefundWindow(order)) return "past_cooling_off";
    return "in_cooling_off";
  };

  // Kargo öncesi = iptal (anında geri ödeme), kargo sonrası = iade akışı.
  // shipment yoksa veya yalnızca pending ise henüz kargolanmamış sayılır.
  const hasShipped = (o: OrderDetail) => {
    const shippedStatuses = [
      "shipped",
      "delivered",
      "awaiting_buyer_confirmation",
      "completed",
    ];
    if (shippedStatuses.includes(o.status)) return true;
    const s = o.shipment?.status;
    return (
      !!s &&
      s !== "pending" &&
      s !== "cancelled" &&
      s !== "failed"
    );
  };

  // Satıcıya escrow ödeme tarihi: teslim + 14 gün iade penceresi + 1 gün grace.
  const computePayoutDate = (o: OrderDetail): Date | null => {
    if (!o.deliveredAt) return null;
    const d = new Date(o.deliveredAt);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + 15);
    return d;
  };

  // 14 GÜNDEN SONRA İADE YOK: teslimden 14 günden fazla geçtiyse iade penceresi
  // kapalıdır (backend de reddeder). Teslim edilmemişse pencere henüz başlamadı.
  const isPastRefundWindow = (o: OrderDetail): boolean => {
    if (!o.deliveredAt) return false;
    const d = new Date(o.deliveredAt);
    if (Number.isNaN(d.getTime())) return false;
    const ageDays = (Date.now() - d.getTime()) / (1000 * 3600 * 24);
    return ageDays > 14;
  };

  const handleCancel = async () => {
    if (!order) return;
    if (
      !(await confirm({
        title: locale === "en" ? "Cancel order" : "Siparişi iptal et",
        description:
          locale === "en"
            ? "Cancel this order? Your payment will be refunded."
            : "Bu siparişi iptal etmek istediğinize emin misiniz? Ödemeniz iade edilecektir.",
        confirmLabel: locale === "en" ? "Yes, cancel" : "Evet, iptal et",
        cancelLabel: locale === "en" ? "No" : "Vazgeç",
        destructive: true,
      }))
    ) {
      return;
    }
    setCancelLoading(true);
    try {
      await api.post(`/orders/${order.id}/cancel`, {});
      toast.success(
        locale === "en" ? "Order cancelled" : "Sipariş iptal edildi",
      );
      await invalidateOrder();
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          (locale === "en"
            ? "Could not cancel order"
            : "Sipariş iptal edilemedi"),
      );
    } finally {
      setCancelLoading(false);
    }
  };

  const handleReactivate = async () => {
    if (!orderId) return;
    setReactivateLoading(true);
    try {
      await api.post(`/orders/${orderId}/reactivate`);
      toast.success(
        locale === "en"
          ? "Order reactivated. You can complete payment now."
          : "Sipariş yeniden aktive edildi. Ödemenizi tamamlayabilirsiniz.",
      );
      await invalidateOrder();
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          (locale === "en"
            ? "Could not reactivate order"
            : "Sipariş aktive edilemedi"),
      );
    } finally {
      setReactivateLoading(false);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!elogoInvoice?.id) {
      toast.error(locale === "en" ? "Invoice not ready" : "Fatura henüz hazır değil");
      return;
    }
    setDownloadingInvoice(true);
    try {
      // Yeni eLogo e-Arşiv ucu → S3 presigned URL döner; yeni sekmede aç (görüntüle/indir).
      const res = await api.get(`/elogo/invoices/${elogoInvoice.id}/pdf`);
      const url = res.data?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        toast.success(locale === "en" ? "Invoice opened" : "Fatura açıldı");
      } else {
        toast.error(locale === "en" ? "Invoice not ready" : "Fatura henüz hazır değil");
      }
    } catch (err: any) {
      const msg = err.response?.data?.message;
      if (err.response?.status === 404) {
        toast.error(msg || (locale === "en" ? "Invoice not found" : "Fatura bulunamadı"));
      } else {
        toast.error(msg || (locale === "en" ? "Download failed" : "İndirme başarısız"));
      }
    } finally {
      setDownloadingInvoice(false);
    }
  };

  // Kurumsal satıcı: siparişe fatura PDF yükle/değiştir.
  const handleSellerInvoiceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error(locale === "en" ? "PDF only" : "Yalnız PDF yükleyebilirsiniz");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(locale === "en" ? "Max 10 MB" : "PDF en fazla 10 MB olabilir");
      return;
    }
    setUploadingSellerInvoice(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post(`/orders/${orderId}/seller-invoice`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(
        res.data?.replaced
          ? locale === "en"
            ? "Invoice replaced, buyer notified"
            : "Fatura değiştirildi, alıcıya mail gönderildi"
          : locale === "en"
            ? "Invoice uploaded, buyer notified"
            : "Fatura yüklendi, alıcıya mail gönderildi",
      );
      fetchSellerInvoice();
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          (locale === "en" ? "Upload failed" : "Yükleme başarısız"),
      );
    } finally {
      setUploadingSellerInvoice(false);
    }
  };

  const handleDownloadSellerInvoice = async () => {
    setDownloadingSellerInvoice(true);
    try {
      const res = await api.get(`/orders/${orderId}/seller-invoice/download`);
      const url = res.data?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        toast.error(locale === "en" ? "Invoice not found" : "Fatura bulunamadı");
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          (locale === "en" ? "Download failed" : "İndirme başarısız"),
      );
    } finally {
      setDownloadingSellerInvoice(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  // Not logged in: show message + link (no redirect – like cart page; avoids flash to login then home)
  if (!authLoading && !isAuthenticated) {
    const loginUrl = `/login?redirect=${encodeURIComponent(`/orders/${orderId}`)}`;
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-muted mb-4">
            {locale === "en"
              ? "Please log in to view this order."
              : "Bu siparişi görüntülemek için giriş yapın."}
          </p>
          <ButtonLink href={loginUrl} className="inline-block">
            {locale === "en" ? "Log in" : "Giriş yap"}
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-muted">
          {locale === "en" ? "Order not found" : "Sipariş bulunamadı"}
        </p>
      </div>
    );
  }

  // Kargo öncesi iptalde status para akışı için 'refunded' olabilir; kullanıcıya
  // "İade Edildi" değil "İptal Edildi" göster (rozet + kargo bilgisi de gizlenir).
  const isIptalOrder = order.cancellationType === "iptal";
  // Durum rozeti önceliği (liste ile aynı): aktif iade > iptal > normal durum.
  // Açık iade varsa sipariş 'delivered' kalsa bile "İade Sürecinde" göster.
  const hasActiveRefund = !!order.activeRefundRequest;
  const displayStatus = hasActiveRefund
    ? "refund_requested"
    : isIptalOrder
      ? "cancelled"
      : order.status;
  const statusLabel = hasActiveRefund
    ? locale === "en"
      ? "Refund in progress"
      : "İade Sürecinde"
    : getOrderStatusLabel(displayStatus);
  const orderAmount = Number(order.totalAmount) || Number(order.amount) || 0;
  const productInfo = order.product || order.items?.[0]?.product;
  const productImage =
    productInfo?.imageUrl || order.items?.[0]?.product?.imageUrl;

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/orders"
            className="p-2 hover:bg-border-subtle rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-muted" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-heading">
              Sipariş #{order.orderNumber}
            </h1>
            <p className="text-sm text-muted">
              {new Date(order.createdAt).toLocaleDateString("tr-TR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <StatusBadge
            status={displayStatus}
            config={orderStatusConfig}
            label={statusLabel}
          />
        </div>

        {/* İptal edilmiş teklif siparişi: alıcı ödemeyi tamamlamak için yeniden aktive edebilir.
            canReactivate backend'de reactivate() ile birebir hesaplanır — buton yalnız gerçekten
            yeniden aktive edilebilen siparişte çıkar (ör. stok bitince/rakip teklif alınınca çıkmaz). */}
        {order.canReactivate && (
          <div className="mb-6 p-4 bg-warning-50 border border-warning-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-warning-800 text-sm">
              {locale === "en"
                ? "This order expired before payment. You can reactivate it to complete payment."
                : "Bu sipariş ödeme yapılmadan süre aşımına uğradı. Ödemeyi tamamlamak için siparişi yeniden aktive edebilirsiniz."}
            </p>
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-shrink-0 flex items-center justify-center gap-2"
              onClick={handleReactivate}
              disabled={reactivateLoading}
            >
              {reactivateLoading ? (
                <Spinner size="sm" color="border-surface-elevated border-t-transparent" />
              ) : (
                <CreditCardIcon className="w-5 h-5" />
              )}
              {locale === "en" ? "Complete payment" : "Ödemeyi tamamla"}
            </Button>
          </div>
        )}

        {/* İptal edilmiş sipariş bilgilendirme kartı: iptal durumunda kargo/ödeme/teslimat
            kartları gizlendiği için sayfa boş kalmasın — iptal tarihi, sebebi ve iade durumu burada özetlenir.
            canReactivate ise yukarıdaki "Ödemeyi tamamla" banner'ı gösterildiğinden bu kart gizlenir. */}
        {order.status === "cancelled" && !order.canReactivate && (
          <div className="mb-6 p-5 bg-danger-50 border border-danger-200 rounded-xl">
            <div className="flex items-start gap-3">
              <XCircleIcon className="w-6 h-6 text-danger-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <h2 className="text-base font-semibold text-danger-800">
                  {locale === "en" ? "This order was cancelled" : "Bu sipariş iptal edildi"}
                </h2>
                {order.cancelledAt && (
                  <p className="text-sm text-danger-700">
                    {locale === "en" ? "Cancelled on " : "İptal tarihi: "}
                    {new Date(order.cancelledAt).toLocaleDateString("tr-TR", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
                {(() => {
                  const cancelMessage = getCancelMessage(
                    order.cancelCategory,
                    order.isBuyer,
                    order.cancelReason,
                    locale,
                  );
                  return cancelMessage ? (
                    <p className="text-sm text-danger-700">{cancelMessage}</p>
                  ) : null;
                })()}
                {order.payment?.status === "refunded" || (order.status as string) === "refunded" ? (
                  <p className="text-sm text-danger-700">
                    {locale === "en"
                      ? "The payment has been refunded."
                      : "Ödemeniz iade edilmiştir."}
                  </p>
                ) : order.payment?.status === "completed" ? (
                  <p className="text-sm text-danger-700">
                    {locale === "en"
                      ? "If a payment was made, the refund will be processed to your original payment method."
                      : "Ödeme yapıldıysa, iadeniz ödemeyi yaptığınız yönteme aktarılacaktır."}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Product Card */}
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-heading mb-4">
                {locale === "en" ? "Product Information" : "Ürün Bilgileri"}
              </h2>
              <div className="flex gap-4">
                <div className="w-24 h-24 bg-surface-alt rounded-lg overflow-hidden flex-shrink-0">
                  {productImage ? (
                    <img
                      src={productImage}
                      alt={
                        productInfo?.title ||
                        (locale === "en" ? "Product" : "Ürün")
                      }
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-surface">
                      <TagIcon className="w-8 h-8 text-border-strong" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <Link
                    href={`/listings/${productInfo?.id}`}
                    className="text-lg font-medium text-heading hover:text-primary-500 transition-colors"
                  >
                    {productInfo?.title ||
                      (locale === "en" ? "Product" : "Ürün")}
                  </Link>
                  <p className="text-sm text-muted mt-1">
                    {locale === "en" ? "Quantity: 1" : "Adet: 1"}
                  </p>
                  <p className="text-xl font-bold text-primary-500 mt-2">
                    {orderAmount.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    TL
                  </p>
                </div>
              </div>
            </div>

            {/* Active Refund Request Banner */}
            {order.activeRefundRequest && (() => {
              const rr = order.activeRefundRequest;
              const isRefunded = rr.status === "refunded";
              const isReturnReady =
                rr.status === "return_shipment_open" && !!rr.returnTrackingNumber;
              const labelMap: Record<string, { tr: string; en: string }> = {
                pending_review: { tr: "Talep İnceleniyor", en: "Under Review" },
                approved: { tr: "Onaylandı, İşleniyor", en: "Approved, Processing" },
                wait_for_delivery: {
                  tr: "Ürün Tesliminden Sonra İade Açılacak",
                  en: "Awaiting Delivery",
                },
                return_shipment_open: {
                  tr: "İade Kargonuz Hazır",
                  en: "Return Shipment Ready",
                },
                return_in_transit: {
                  tr: "İade Yolda",
                  en: "Return In Transit",
                },
                return_delivered: {
                  tr: "Satıcıya Ulaştı, Para İadesi Yapılıyor",
                  en: "Delivered, Refund Processing",
                },
                refunded: { tr: "İade Tamamlandı", en: "Refunded" },
                disputed: { tr: "İtirazlı (İnceleniyor)", en: "Under Dispute" },
              };
              const lbl = labelMap[rr.status] ?? { tr: rr.status, en: rr.status };
              return (
                <div
                  className={`rounded-xl shadow-sm p-6 border-2 ${
                    isRefunded
                      ? "bg-success-50 border-success-200"
                      : "bg-info-50 border-info-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h2
                        className={`text-lg font-semibold flex items-center gap-2 ${
                          isRefunded ? "text-success-800" : "text-info-800"
                        }`}
                      >
                        <ArrowUturnLeftIcon className="w-5 h-5" />
                        {locale === "en" ? "Refund Request" : "İade Talebi"}
                      </h2>
                      <p className="text-sm text-muted mt-1">
                        {rr.refundNumber} ·{" "}
                        {new Date(rr.createdAt).toLocaleDateString(
                          locale === "en" ? "en-US" : "tr-TR",
                        )}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${
                        isRefunded
                          ? "bg-success-100 text-success-800 border-success-300"
                          : "bg-info-100 text-info-800 border-info-300"
                      }`}
                    >
                      {locale === "en" ? lbl.en : lbl.tr}
                    </span>
                  </div>

                  {isReturnReady && (
                    <div className="bg-surface-elevated rounded-lg p-4 mb-3">
                      <p className="text-sm text-body mb-2">
                        {order.isBuyer
                          ? locale === "en"
                            ? "Drop the package off at any Sürat branch with this number:"
                            : "Bu numarayı paketle birlikte herhangi bir Sürat şubesine bırakın:"
                          : locale === "en"
                            ? "The buyer has been given a return label. Package will be sent to your address."
                            : "Alıcıya iade kargo etiketi verildi. Paket adresinize gönderilecek."}
                      </p>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-lg font-bold text-heading break-all">
                          {rr.returnTrackingNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(rr.returnTrackingNumber!);
                            toast.success(locale === "en" ? "Copied" : "Kopyalandı");
                          }}
                          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                        >
                          {locale === "en" ? "Copy" : "Kopyala"}
                        </button>
                      </div>
                    </div>
                  )}

                  {rr.returnProvider === "surat" && rr.returnTrackingNumber && (
                    <a
                      href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(rr.returnTrackingNumber)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium mr-4"
                    >
                      <TruckIcon className="w-4 h-4" />
                      {locale === "en" ? "Track Return" : "İade Kargosunu Takip Et"}
                    </a>
                  )}

                  <Link
                    href={`/refund-requests/${rr.id}`}
                    className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {locale === "en" ? "View Details →" : "Detayı Gör →"}
                  </Link>
                </div>
              );
            })()}

            {/* Shipping Info — SADECE gerçek gönderi varken: shipment + dolu trackingNumber +
                sipariş durumu kargolanmış/teslim (shipped/delivered/awaiting/completed). İptal
                (iptal veya cancelled) ya da teslim öncesi (pending_payment/paid/preparing)
                durumlarda placeholder/eski kargo bilgisi gösterilmez. */}
            {order.shipment &&
              !!order.shipment.trackingNumber &&
              !isIptalOrder &&
              order.status !== "cancelled" &&
              [
                "shipped",
                "delivered",
                "awaiting_buyer_confirmation",
                "completed",
              ].includes(order.status) &&
              (() => {
              // Sipariş durumu (order.status) admin tarafından elle ileri alındığında
              // shipment.status geride kalabiliyor. Bu durumda kargo kartının "Satıcı
              // hazırlıyor" gibi yanıltıcı bilgi göstermemesi için sipariş durumunu
              // gerçeğin kaynağı kabul edip etkin (effective) bir kargo durumu türetiyoruz.
              const orderShipped = [
                "shipped",
                "delivered",
                "awaiting_buyer_confirmation",
                "completed",
              ].includes(order.status);
              const orderDelivered = [
                "delivered",
                "awaiting_buyer_confirmation",
                "completed",
              ].includes(order.status);

              let s = order.shipment.status;
              const isReturnFlow =
                s === "return_in_progress" || s === "returned";
              // İptal/iade edilen siparişlerde kargo durumu (örn. eski bir
              // 'delivered' kaydı) yanıltıcı olmasın diye sipariş durumunu
              // gerçeğin kaynağı kabul edip kargoyu 'cancelled' olarak göster.
              const orderCancelled =
                order.status === "cancelled" || order.status === "refunded";
              if (orderCancelled && !isReturnFlow) {
                s = "cancelled";
              } else if (orderDelivered && s !== "delivered" && !isReturnFlow) {
                s = "delivered";
              } else if (
                orderShipped &&
                (s === "pending" || s === "label_created")
              ) {
                s = "in_transit";
              }

              const isPending = s === "pending";
              const isCancelled = s === "cancelled" || s === "failed";
              const isShippedActive =
                s === "label_created" ||
                s === "picked_up" ||
                s === "in_transit" ||
                s === "at_delivery_branch" ||
                s === "out_for_delivery";
              const isDelivered = s === "delivered";

              // Satıcı için pending durumunda kartı tamamen gizle —
              // 'Kargo Referans Numarası' aksiyon kartı zaten görünüyor
              if (isPending && order.isSeller && !order.isBuyer) {
                return null;
              }

              const statusLabelMap: Record<string, { tr: string; en: string }> = {
                pending: { tr: "Satıcı Hazırlıyor", en: "Preparing" },
                label_created: { tr: "Kargo Etiketi Oluşturuldu", en: "Label Created" },
                picked_up: { tr: "Şubeye Teslim Edildi", en: "Picked Up" },
                in_transit: { tr: "Yolda", en: "In Transit" },
                at_delivery_branch: { tr: "Dağıtım Şubesinde", en: "At Delivery Branch" },
                out_for_delivery: { tr: "Dağıtıma Çıktı", en: "Out For Delivery" },
                delivered: { tr: "Teslim Edildi", en: "Delivered" },
                failed: { tr: "Teslim Edilemedi", en: "Failed" },
                return_in_progress: { tr: "İade Yolda", en: "Return In Progress" },
                returned: { tr: "İade Tamamlandı", en: "Returned" },
                cancelled: { tr: "İptal Edildi", en: "Cancelled" },
              };
              const statusLbl = statusLabelMap[s] ?? { tr: s, en: s };

              return (
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                    <TruckIcon className="w-5 h-5" />
                    {locale === "en" ? "Shipping Information" : "Kargo Bilgileri"}
                  </h2>

                  {isPending && order.isBuyer && (
                    <div className="bg-info-50 border border-info-200 rounded-lg p-4 text-sm text-info-800">
                      {locale === "en"
                        ? "The seller is preparing your package. Tracking details will appear here once it's handed over to Sürat."
                        : "Satıcı paketinizi hazırlıyor. Sürat şubesine teslim edildiği anda takip bilgileri burada görünecek."}
                    </div>
                  )}

                  {isCancelled && (
                    <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 text-sm text-danger-800">
                      {locale === "en"
                        ? "This shipment has been cancelled."
                        : "Bu kargo iptal edildi."}
                    </div>
                  )}

                  {(isShippedActive || isDelivered) && (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted">
                          {locale === "en" ? "Carrier:" : "Kargo Firması:"}
                        </span>
                        <span className="font-medium">
                          {order.shipment.provider === "surat"
                            ? "Sürat Kargo"
                            : order.shipment.provider}
                        </span>
                      </div>
                      {order.shipment.trackingNumber && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted">
                            {locale === "en" ? "Tracking Number:" : "Takip Numarası:"}
                          </span>
                          <span className="font-mono bg-surface-alt px-2 py-1 rounded text-sm">
                            {order.shipment.trackingNumber}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted">
                          {locale === "en" ? "Status:" : "Durum:"}
                        </span>
                        <span
                          className={`font-medium ${isDelivered ? "text-success-700" : "text-info-700"}`}
                        >
                          {locale === "en" ? statusLbl.en : statusLbl.tr}
                        </span>
                      </div>
                      {order.isBuyer && order.shipment.trackingNumber && (
                        <div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-border-default">
                          {order.shipment.provider === "surat" && (
                            <a
                              href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(order.shipment.trackingNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-inverted rounded-lg text-sm font-medium transition-colors"
                            >
                              <TruckIcon className="w-4 h-4" />
                              {locale === "en" ? "Track on Sürat" : "Sürat'ta Takip Et"}
                            </a>
                          )}
                          {/* "Tarodan'da Takip Et" butonu kaldırıldı (UI sadeleştirme). */}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Shipping Address - sadece ödeme bekleyen alıcı değilse göster (alıcı için adres ödeme kartının içinde) */}
            {/* Üyelik/dijital siparişlerde teslimat adresi yoktur */}
            {order.shippingAddress &&
              !isMembershipOrder(order) &&
              !(order.isBuyer && order.status === "pending_payment") && (
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                    <MapPinIcon className="w-5 h-5" />
                    Teslimat Adresi
                  </h2>
                  <div className="text-body">
                    <p className="font-medium">{order.shippingAddress.title}</p>
                    <p>{order.shippingAddress.addressLine1}</p>
                    {order.shippingAddress.addressLine2 && (
                      <p>{order.shippingAddress.addressLine2}</p>
                    )}
                    <p>
                      {order.shippingAddress.district},{" "}
                      {order.shippingAddress.city}{" "}
                      {order.shippingAddress.postalCode}
                    </p>
                  </div>
                </div>
              )}

            {/* Actions for Seller */}
            {order.isSeller && order.status === "paid" && (
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-heading mb-4">
                  {locale === "en" ? "Seller Actions" : "Satıcı İşlemleri"}
                </h2>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => handleUpdateStatus("preparing")}
                >
                  {locale === "en"
                    ? "Mark as Preparing"
                    : "Hazırlanıyor Olarak İşaretle"}
                </Button>
              </div>
            )}

            {order.isSeller && order.status === "preparing" && (
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                  <TruckIcon className="w-5 h-5" />
                  {locale === "en" ? "Cargo Reference" : "Kargo Referans Numarası"}
                </h2>
                <p className="text-muted mb-4">
                  {locale === "en"
                    ? "Hand this number to the Sürat Kargo branch when delivering your package. The shipment is already registered — the branch will retrieve all details automatically."
                    : "Paketi Sürat Kargo şubesine teslim ederken bu numarayı veriniz. Gönderi zaten sistemde kayıtlıdır — şube tüm bilgileri otomatik olarak alacaktır."}
                </p>
                <div className="flex items-center gap-2 mb-4">
                  <code className="flex-1 font-mono text-lg bg-surface-alt px-4 py-3 rounded-lg border border-border-default text-center font-semibold tracking-wider">
                    {order.orderNumber}
                  </code>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      navigator.clipboard.writeText(order.orderNumber);
                      toast.success(
                        locale === "en"
                          ? "Order number copied"
                          : "Sipariş numarası kopyalandı",
                      );
                    }}
                  >
                    {locale === "en" ? "Copy" : "Kopyala"}
                  </Button>
                </div>
                <p className="text-sm text-muted">
                  {locale === "en"
                    ? "Once the branch receives your package, the Sürat tracking number will appear here automatically (within 30 minutes)."
                    : "Şube paketinizi aldığında Sürat takip numarası burada otomatik olarak görünecektir (30 dakika içinde)."}
                </p>
              </div>
            )}

            {/* Pending Payment – Buyer: full checkout (address + card + pay) */}
            {order.isBuyer && order.status === "pending_payment" && (
              <div className="bg-surface-elevated rounded-xl shadow-sm overflow-hidden">
                {/* Header banner */}
                <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
                  <h2 className="text-lg font-semibold text-inverted flex items-center gap-2">
                    <CreditCardIcon className="w-5 h-5" />
                    {locale === "en"
                      ? "Complete Your Payment"
                      : "Ödemenizi Tamamlayın"}
                  </h2>
                  <p className="text-sm text-primary-100 mt-1">
                    {locale === "en"
                      ? "Your offer has been accepted. Complete the payment to finalize the purchase."
                      : "Teklifiniz kabul edildi. Satın alma işlemini tamamlamak için ödeme yapın."}
                  </p>
                </div>

                <div className="p-6 space-y-6">
                  {/* Section 1: Teslimat Adresi - kayıtlı adreslerden seç veya yeni adres ekle (normal ödeme gibi) */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                        1
                      </span>
                      <h3 className="font-semibold text-heading flex items-center gap-2">
                        <MapPinIcon className="w-5 h-5 text-primary-500" />
                        {locale === "en"
                          ? "Delivery Address"
                          : "Teslimat Adresi"}
                      </h3>
                    </div>

                    {!addressesFetched ? (
                      <div className="flex items-center gap-2 text-sm text-muted py-4">
                        <Spinner
                          size="sm"
                          color="border-border border-t-primary-500"
                        />
                        {locale === "en"
                          ? "Loading addresses..."
                          : "Adresler yükleniyor..."}
                      </div>
                    ) : !showNewAddressForm ? (
                      <div className="space-y-2">
                        {savedAddresses.map((addr: any) => (
                          <label
                            key={addr.id}
                            className={`flex items-center gap-3 p-3.5 border-2 rounded-lg cursor-pointer transition-all ${
                              selectedAddressId === addr.id
                                ? "border-primary-500 bg-primary-50"
                                : "border-border hover:border-border"
                            }`}
                          >
                            <Radio
                              name="shippingAddress"
                              checked={selectedAddressId === addr.id}
                              onChange={() => setSelectedAddressId(addr.id)}
                              className="text-primary-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-heading">
                                {addr.title || addr.fullName}
                              </p>
                              <p className="text-xs text-muted mt-0.5">
                                {addr.address}, {addr.district}/{addr.city}
                              </p>
                            </div>
                            {addr.isDefault && (
                              <span className="text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded-sm">
                                {locale === "en" ? "Default" : "Varsayılan"}
                              </span>
                            )}
                          </label>
                        ))}
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => {
                            setShowNewAddressForm(true);
                            setSelectedAddressId(null);
                          }}
                          className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium py-2"
                        >
                          <PlusIcon className="w-4 h-4" />
                          {locale === "en"
                            ? "Add new address"
                            : "Yeni adres ekle"}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {savedAddresses.length > 0 && (
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={() => {
                              setShowNewAddressForm(false);
                              if (
                                !selectedAddressId &&
                                savedAddresses.length > 0
                              ) {
                                setSelectedAddressId(savedAddresses[0].id);
                              }
                            }}
                            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                          >
                            &larr;{" "}
                            {locale === "en"
                              ? "Back to saved addresses"
                              : "Kayıtlı adreslere dön"}
                          </Button>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-body mb-1">
                              {locale === "en" ? "Full Name" : "Ad Soyad"} *
                            </label>
                            <Input
                              type="text"
                              value={newAddress.fullName}
                              onChange={(e) =>
                                setNewAddress((a) => ({
                                  ...a,
                                  fullName: e.target.value,
                                }))
                              }
                              placeholder={
                                locale === "en" ? "John Doe" : "Ahmet Yılmaz"
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-body mb-1">
                              {locale === "en" ? "Phone" : "Telefon"} *
                            </label>
                            <Input
                              type="tel"
                              value={newAddress.phone}
                              onChange={(e) =>
                                setNewAddress((a) => ({
                                  ...a,
                                  phone: e.target.value,
                                }))
                              }
                              placeholder="05XX XXX XX XX"
                            />
                          </div>
                        </div>
                        <CityDistrictSelector
                          city={newAddress.city}
                          district={newAddress.district}
                          onCityChange={(city) =>
                            setNewAddress((a) => ({ ...a, city, district: "" }))
                          }
                          onDistrictChange={(district) =>
                            setNewAddress((a) => ({ ...a, district }))
                          }
                        />
                        <div>
                          <label className="block text-sm font-medium text-body mb-1">
                            {locale === "en" ? "Address" : "Adres"} *
                          </label>
                          <Textarea
                            value={newAddress.address}
                            onChange={(e) =>
                              setNewAddress((a) => ({
                                ...a,
                                address: e.target.value,
                              }))
                            }
                            rows={2}
                            className="py-2.5 resize-none"
                            placeholder={
                              locale === "en"
                                ? "Street, building, floor..."
                                : "Mahalle, sokak, bina, kat..."
                            }
                          />
                        </div>
                        <div className="sm:w-1/2">
                          <label className="block text-sm font-medium text-body mb-1">
                            {locale === "en" ? "Postal Code" : "Posta Kodu"}
                          </label>
                          <Input
                            type="text"
                            value={newAddress.zipCode}
                            onChange={(e) =>
                              setNewAddress((a) => ({
                                ...a,
                                zipCode: e.target.value,
                              }))
                            }
                            placeholder="34000"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section 2: Secure payment via PayTR (kart bilgileri PayTR sayfasında alınır) */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                        2
                      </span>
                      <h3 className="font-semibold text-heading flex items-center gap-2">
                        <ShieldCheckIcon className="w-5 h-5 text-success-500" />
                        {locale === "en"
                          ? "Secure Payment"
                          : "Güvenli Ödeme"}
                      </h3>
                    </div>

                    <div className="p-4 bg-surface border border-border rounded-lg flex items-start gap-3">
                      <ShieldCheckIcon className="w-5 h-5 text-success-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-muted">
                        {locale === "en"
                          ? "You'll enter your card on our secure payment page (3D Secure). Your card details are never stored on our servers — they're processed via PayTR over 256-bit SSL."
                          : "Kart bilgilerinizi güvenli ödeme sayfamızda gireceksiniz (3D Secure). Kart bilgileriniz sunucularımızda saklanmaz; PayTR altyapısıyla 256-bit SSL üzerinden işlenir."}
                      </p>
                    </div>
                  </div>

                  {/* Ödeme Yap - adres zorunlu (kayıtlıdan seç veya yeni adres doldur) */}
                  <div>
                    <Button
                      variant="success"
                      size="lg"
                      className="w-full flex items-center justify-center gap-2 text-base"
                      onClick={handleSetAddressAndPay}
                      disabled={
                        addressLoading ||
                        paymentLoading ||
                        (!showNewAddressForm && !selectedAddressId) ||
                        (showNewAddressForm &&
                          (!newAddress.fullName ||
                            !newAddress.phone ||
                            !newAddress.city ||
                            !newAddress.district ||
                            !newAddress.address))
                      }
                    >
                      <ShieldCheckIcon className="w-5 h-5" />
                      {addressLoading || paymentLoading
                        ? locale === "en"
                          ? "Processing..."
                          : "İşleniyor..."
                        : `${locale === "en" ? "Pay" : "Ödeme Yap"} – ${orderAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Escrow bilgisi (teslim sonrası) — alıcı onayı artık payout tetiklemez.
                Satıcıya ödeme: teslim + 14 gün iade penceresi + 1 gün grace ile otomatik. */}
            {order.isBuyer &&
              ["delivered", "awaiting_buyer_confirmation"].includes(
                order.status,
              ) &&
              !isMembershipOrder(order) && (
                <div className="bg-info-50 border border-info-200 rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-info-800 mb-2 flex items-center gap-2">
                    <ShieldCheckIcon className="w-5 h-5" />
                    {locale === "en" ? "Delivered" : "Teslim Edildi"}
                  </h2>
                  {(() => {
                    const payoutDate = computePayoutDate(order);
                    return (
                      <>
                        <p className="text-sm text-info-800">
                          {payoutDate
                            ? locale === "en"
                              ? `Payment to the seller is released 14 days after delivery (on ${payoutDate.toLocaleDateString(
                                  "en-US",
                                  {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  },
                                )}). You have until then to request a refund.`
                              : `Satıcıya ödeme teslimden 14 gün sonra serbest bırakılır (${payoutDate.toLocaleDateString(
                                  "tr-TR",
                                  {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  },
                                )}). O tarihe kadar iade talep edebilirsiniz.`
                            : locale === "en"
                              ? "Payment to the seller is released 14 days after delivery. You can request a refund during this window."
                              : "Satıcıya ödeme teslimden 14 gün sonra serbest bırakılır. Bu süre içinde iade talep edebilirsiniz."}
                        </p>
                        {order.activeRefundRequest && (
                          <p className="text-sm text-info-800 mt-2 font-medium">
                            {locale === "en"
                              ? "Payment is on hold until the open refund request is resolved."
                              : "Açık iade talebiniz sonuçlanana kadar ödeme bekletiliyor."}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

            {/* Yorum Yap - Sadece alınan siparişlerde, teslim/tamamlandıktan sonra */}
            {canReview(order) && (
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-heading mb-4">
                  {t("review.reviewOrder")}
                </h2>
                <p className="text-sm text-muted mb-4">
                  {locale === "en"
                    ? "Share your experience about the product and seller."
                    : "Ürün ve satıcı hakkında deneyiminizi paylaşın."}
                </p>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={openReviewModal}
                >
                  <StarIcon className="w-5 h-5" />
                  {t("review.writeReview")}
                </Button>
              </div>
            )}

            {/* İptal / İade — Sadece alıcı. Kargo öncesi "İptal Et" (anında geri ödeme),
                kargo sonrası "İade Talep Et". Üyelik/dijital siparişler hariç. */}
            {order.payment &&
              order.payment.status === "completed" &&
              order.isBuyer &&
              !isMembershipOrder(order) &&
              order.status !== "cancelled" &&
              order.status !== "refunded" &&
              !order.activeRefundRequest &&
              (() => {
                const shipped = hasShipped(order);
                const pastWindow = isPastRefundWindow(order);
                // 14 günden sonra iade yok: kargo sonrası + pencere kapalı ise
                // iade butonu yerine "süre doldu" bilgisi göster.
                if (shipped && pastWindow) {
                  return (
                    <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                      <h2 className="text-lg font-semibold text-heading mb-2">
                        {locale === "en" ? "Refund window closed" : "İade Süresi Doldu"}
                      </h2>
                      <p className="text-sm text-muted">
                        {locale === "en"
                          ? "The 14-day refund window has passed; a refund can no longer be requested for this order."
                          : "14 günlük iade süresi doldu; bu sipariş için artık iade talebi oluşturulamaz."}
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-heading mb-4">
                      {shipped
                        ? locale === "en"
                          ? "Refund"
                          : "İade İşlemi"
                        : locale === "en"
                          ? "Cancel Order"
                          : "Siparişi İptal Et"}
                    </h2>
                    <p className="text-sm text-muted mb-4">
                      {shipped
                        ? locale === "en"
                          ? "The order has shipped. You can request a refund within 14 days of delivery — no reason or photo required."
                          : "Sipariş kargoya verildi. Teslimden sonra 14 gün içinde sebep ya da fotoğraf belirtmeden iade talep edebilirsiniz."
                        : locale === "en"
                          ? "The order hasn't shipped yet. You can cancel it now and your payment will be refunded."
                          : "Sipariş henüz kargoya verilmedi. Şimdi iptal edebilirsiniz; ödemeniz iade edilecektir."}
                    </p>
                    {shipped ? (
                      <Button
                        variant="secondary"
                        size="lg"
                        className="w-full flex items-center justify-center gap-2"
                        onClick={handleRefund}
                      >
                        <ArrowUturnLeftIcon className="w-5 h-5" />
                        {locale === "en"
                          ? "Request Refund"
                          : "İade Talebi Oluştur"}
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        size="lg"
                        className="w-full flex items-center justify-center gap-2"
                        onClick={handleCancel}
                        disabled={cancelLoading}
                      >
                        {cancelLoading ? (
                          <Spinner
                            size="sm"
                            color="border-surface-elevated border-t-transparent"
                          />
                        ) : (
                          <XCircleIcon className="w-5 h-5" />
                        )}
                        {locale === "en" ? "Cancel Order" : "Siparişi İptal Et"}
                      </Button>
                    )}
                  </div>
                );
              })()}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Order Summary */}
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5" />
                {locale === "en" ? "Order Summary" : "Sipariş Özeti"}
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between text-muted">
                  <span>
                    {locale === "en" ? "Product Amount" : "Ürün Tutarı"}
                  </span>
                  <span>
                    ₺
                    {(
                      order.pricing?.subtotal ??
                      orderAmount -
                        (order.pricing?.shippingAmount ??
                          order.shippingCost ??
                          0) -
                        (order.pricing?.buyerFeeAmount ??
                          order.buyerFeeAmount ??
                          0)
                    ).toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {/* KDV: yalnızca kurumsal satıcıda (taxAmount > 0) ayrı satır */}
                {(order.pricing?.taxAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-muted">
                    <span>{locale === "en" ? "VAT" : "KDV"}</span>
                    <span>
                      ₺
                      {Number(order.pricing?.taxAmount ?? 0).toLocaleString(
                        "tr-TR",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        },
                      )}
                    </span>
                  </div>
                )}
                {/* Üyelik/dijital siparişlerde kargo satırı yoktur */}
                {!isMembershipOrder(order) && (
                  <div className="flex justify-between text-muted">
                    <span>{locale === "en" ? "Shipping" : "Kargo"}</span>
                    <span>
                      {(order.pricing?.shippingAmount ??
                        order.shippingCost ??
                        0) > 0
                        ? `₺${Number(order.pricing?.shippingAmount ?? order.shippingCost ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : locale === "en"
                          ? "Free"
                          : "Ücretsiz"}
                    </span>
                  </div>
                )}
                {(order.pricing?.buyerFeeAmount ?? order.buyerFeeAmount ?? 0) >
                  0 && (
                  <div className="flex justify-between text-muted">
                    <span>
                      {locale === "en" ? "Platform fee" : "Platform ücreti"}
                    </span>
                    <span>
                      ₺
                      {Number(
                        order.pricing?.buyerFeeAmount ??
                          order.buyerFeeAmount ??
                          0,
                      ).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
                {order.isSeller &&
                  ((order.pricing?.sellerFeeAmount ??
                    order.sellerFeeAmount ??
                    0) > 0 ||
                    order.pricing?.sellerNetAmount != null) && (
                    <>
                      <div className="flex justify-between text-muted">
                        <span>
                          {locale === "en"
                            ? "Platform deduction"
                            : "Platform kesintisi"}
                        </span>
                        <span>
                          ₺
                          {Number(
                            order.pricing?.sellerFeeAmount ??
                              order.sellerFeeAmount ??
                              0,
                          ).toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      {/* Stopaj: yalnızca kurumsal satıcıda (>0). GVK 94/19 — satıcı beyannamede mahsup eder. */}
                      {(order.pricing?.withholdingTaxAmount ?? 0) > 0 && (
                        <div className="flex justify-between text-muted">
                          <span>
                            {locale === "en"
                              ? "Withholding tax"
                              : "Stopaj (tevkifat)"}
                          </span>
                          <span>
                            ₺
                            {Number(
                              order.pricing?.withholdingTaxAmount ?? 0,
                            ).toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-success-700 font-medium">
                        <span>
                          {locale === "en" ? "Net to you" : "Net kazanç"}
                        </span>
                        <span>
                          ₺
                          {Number(
                            order.pricing?.sellerNetAmount ??
                              (order.pricing?.subtotal ?? orderAmount) -
                                (order.pricing?.sellerFeeAmount ??
                                  order.sellerFeeAmount ??
                                  0),
                          ).toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </>
                  )}
                <div className="border-t pt-3 flex justify-between font-semibold text-lg">
                  <span>{locale === "en" ? "Total" : "Toplam"}</span>
                  <span className="text-primary-500">
                    {orderAmount.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    TL
                  </span>
                </div>
              </div>
            </div>

            {/* Buyer/Seller Info */}
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-heading mb-4">
                {order.isBuyer
                  ? locale === "en"
                    ? "Seller"
                    : "Satıcı"
                  : locale === "en"
                    ? "Buyer"
                    : "Alıcı"}
              </h2>
              <Link
                href={`/seller/${order.isBuyer ? order.seller.id : order.buyer.id}`}
                className="flex items-center gap-3 hover:bg-surface -mx-2 px-2 py-2 rounded-lg transition-colors"
              >
                <UserAvatar
                  displayName={
                    order.isBuyer
                      ? order.seller.displayName
                      : order.buyer.displayName
                  }
                  avatarUrl={
                    order.isBuyer
                      ? order.seller.avatarUrl
                      : order.buyer.avatarUrl
                  }
                  size="md"
                />
                <div>
                  <p className="font-medium text-heading">
                    {order.isBuyer
                      ? order.seller.displayName
                      : order.buyer.displayName}
                  </p>
                  <p className="text-sm text-muted">
                    {locale === "en" ? "View Profile" : "Profili Gör"}
                  </p>
                </div>
              </Link>
            </div>

            {/* Invoice Section - yalnız gerçek e-Arşiv HAZIRSA çıkar */}
            {elogoInvoice && (
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-success-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {locale === "en" ? "Invoice" : "Fatura"}
                  </h2>
                  <div className="flex items-start gap-3 p-3 bg-success-50 rounded-lg border border-success-100">
                    <svg
                      className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm text-success-800 mb-1">
                        {locale === "en"
                          ? "Your invoice has been sent to your email address."
                          : "Faturanız e-posta adresinize gönderildi."}
                      </p>
                      {elogoInvoice.invoiceNumber && (
                        <p className="text-xs text-success-700 mb-2">
                          {(locale === "en" ? "No: " : "No: ") + elogoInvoice.invoiceNumber}
                        </p>
                      )}
                      <Button
                        variant="success"
                        size="sm"
                        onClick={handleDownloadInvoice}
                        disabled={downloadingInvoice}
                      >
                        {downloadingInvoice
                          ? locale === "en"
                            ? "Opening..."
                            : "Açılıyor..."
                          : locale === "en"
                            ? "View / Download Invoice"
                            : "Faturayı Görüntüle / İndir"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

            {/* Kurumsal satıcı faturası (elle yüklenen PDF) */}
            {sellerInvoice &&
              (sellerInvoice.canUpload ||
                (sellerInvoice.invoice && (sellerInvoice.isBuyer || sellerInvoice.isSeller))) && (
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-brand-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    {locale === "en" ? "Seller Invoice" : "Satıcı Faturası"}
                  </h2>

                  {sellerInvoice.invoice ? (
                    <div className="flex items-start gap-3 p-3 bg-surface rounded-lg border border-default">
                      <svg
                        className="w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-body truncate">
                          {sellerInvoice.invoice.fileName}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleDownloadSellerInvoice}
                            disabled={downloadingSellerInvoice}
                          >
                            {downloadingSellerInvoice
                              ? locale === "en"
                                ? "Opening..."
                                : "Açılıyor..."
                              : locale === "en"
                                ? "View / Download"
                                : "Görüntüle / İndir"}
                          </Button>
                          {sellerInvoice.canUpload && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => sellerInvoiceInputRef.current?.click()}
                              disabled={uploadingSellerInvoice}
                            >
                              {uploadingSellerInvoice
                                ? locale === "en"
                                  ? "Uploading..."
                                  : "Yükleniyor..."
                                : locale === "en"
                                  ? "Replace"
                                  : "Değiştir"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-surface rounded-lg border border-dashed border-default">
                      <p className="text-sm text-muted mb-3">
                        {locale === "en"
                          ? "You can upload the product invoice (PDF) for this order. The buyer will be notified by email."
                          : "Bu sipariş için ürün faturanızı (PDF) yükleyebilirsiniz. Alıcıya e-posta ile bildirilir."}
                      </p>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => sellerInvoiceInputRef.current?.click()}
                        disabled={uploadingSellerInvoice}
                      >
                        {uploadingSellerInvoice
                          ? locale === "en"
                            ? "Uploading..."
                            : "Yükleniyor..."
                          : locale === "en"
                            ? "Upload Invoice (PDF)"
                            : "Fatura Yükle (PDF)"}
                      </Button>
                    </div>
                  )}

                  <input
                    ref={sellerInvoiceInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleSellerInvoiceFile}
                  />
                </div>
              )}

            {/* Help */}
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-heading mb-4">
                {locale === "en" ? "Help" : "Yardım"}
              </h2>
              <div className="space-y-2">
                <Link
                  href={`/support?orderId=${orderId}`}
                  className="block w-full text-left px-4 py-2 text-muted hover:bg-surface rounded-lg transition-colors"
                >
                  {locale === "en"
                    ? "Report Order Issue"
                    : "Sipariş Sorunu Bildir"}
                </Link>
                <Link
                  href="/refund-requests"
                  className="block w-full text-left px-4 py-2 text-muted hover:bg-surface rounded-lg transition-colors"
                >
                  {locale === "en"
                    ? "My Refund Requests"
                    : "İade Taleplerim"}
                </Link>
                <Link
                  href="/support"
                  className="block w-full text-left px-4 py-2 text-muted hover:bg-surface rounded-lg transition-colors"
                >
                  {locale === "en"
                    ? "Contact Support"
                    : "Destek ile İletişime Geç"}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Review Modal */}
        <Modal
          isOpen={showReviewModal && !!order}
          onClose={() => setShowReviewModal(false)}
          title={t("review.reviewOrder")}
          maxWidth="max-w-lg"
        >
          {/* Product Section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
              📦 {t("review.productReview")}
            </h3>

            {(order.product || order.items?.[0]?.product) && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-surface rounded-lg">
                <div className="w-12 h-12 bg-border-subtle rounded flex items-center justify-center text-2xl overflow-hidden">
                  {order.product?.imageUrl ||
                  order.items?.[0]?.product?.imageUrl ? (
                    <img
                      src={
                        order.product?.imageUrl ||
                        order.items?.[0]?.product?.imageUrl
                      }
                      alt={locale === "en" ? "Product" : "Ürün"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    "🚗"
                  )}
                </div>
                <p className="font-medium text-heading">
                  {order.product?.title || order.items?.[0]?.product?.title}
                </p>
              </div>
            )}

            <div className="mb-3">
              <label className="block text-sm font-medium text-body mb-2">
                {t("review.productScore")}
              </label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Button
                    variant="secondary"
                    key={star}
                    type="button"
                    onClick={() => setReviewScore(star)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    {star <= reviewScore ? (
                      <StarIcon className="w-8 h-8 text-warning-400" />
                    ) : (
                      <StarOutlineIcon className="w-8 h-8 text-border-strong" />
                    )}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-body mb-1">
                {t("review.titleOptional")}
              </label>
              <Input
                type="text"
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                placeholder={
                  locale === "en"
                    ? "E.g.: Great product!"
                    : "Örn: Harika bir ürün!"
                }
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-body mb-1">
                {t("review.commentOptional")}
              </label>
              <Textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder={
                  locale === "en"
                    ? "Share your experience about the product..."
                    : "Ürün hakkında deneyiminizi paylaşın..."
                }
                rows={3}
                className="px-4"
                maxLength={1000}
              />
            </div>

            {/* Photo Upload */}
            <div className="mt-3">
              <label className="block text-sm font-medium text-body mb-1">
                {locale === "en"
                  ? "Photos (optional, max 5)"
                  : "Fotoğraflar (opsiyonel, maks 5)"}
              </label>
              <div className="flex flex-wrap gap-2">
                {reviewImagePreviews.map((src, idx) => (
                  <div
                    key={idx}
                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-border"
                  >
                    <img
                      src={src}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => removeReviewImage(idx)}
                      className="absolute top-0 right-0 bg-danger-500 text-inverted rounded-bl-lg w-5 h-5 flex items-center justify-center text-xs"
                    >
                      ×
                    </Button>
                  </div>
                ))}
                {reviewImages.length < 5 && (
                  <label className="w-16 h-16 border-2 border-dashed items-center justify-center cursor-pointer hover:border-primary-400">
                    <span className="text-2xl text-subtle">+</span>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleReviewImageAdd}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-border my-6"></div>

          {/* Seller Section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
              👤 {t("review.sellerReview")}
            </h3>

            {order.seller && (
              <p className="text-sm text-muted mb-4">
                {t("product.seller")}:{" "}
                <span className="font-medium text-heading">
                  {order.seller.displayName}
                </span>
              </p>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-body">
                  {t("review.communication")}
                </span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Button
                      variant="secondary"
                      key={star}
                      type="button"
                      onClick={() => setSellerCommunication(star)}
                      className="p-0.5 hover:scale-110 transition-transform"
                    >
                      {star <= sellerCommunication ? (
                        <StarIcon className="w-5 h-5 text-warning-400" />
                      ) : (
                        <StarOutlineIcon className="w-5 h-5 text-border-strong" />
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-body">
                  {t("review.shippingSpeed")}
                </span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Button
                      variant="secondary"
                      key={star}
                      type="button"
                      onClick={() => setSellerShipping(star)}
                      className="p-0.5 hover:scale-110 transition-transform"
                    >
                      {star <= sellerShipping ? (
                        <StarIcon className="w-5 h-5 text-warning-400" />
                      ) : (
                        <StarOutlineIcon className="w-5 h-5 text-border-strong" />
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-body">
                  {t("review.packaging")}
                </span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Button
                      variant="secondary"
                      key={star}
                      type="button"
                      onClick={() => setSellerPackaging(star)}
                      className="p-0.5 hover:scale-110 transition-transform"
                    >
                      {star <= sellerPackaging ? (
                        <StarIcon className="w-5 h-5 text-warning-400" />
                      ) : (
                        <StarOutlineIcon className="w-5 h-5 text-border-strong" />
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-body mb-1">
                  {t("review.sellerComment")}
                </label>
                <Textarea
                  value={sellerReviewText}
                  onChange={(e) => setSellerReviewText(e.target.value)}
                  placeholder={t("review.sellerCommentPlaceholder")}
                  className="border-border resize-none"
                  rows={3}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={() => setShowReviewModal(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="md"
              className="flex-1"
              onClick={submitReview}
              disabled={submittingReview}
            >
              {submittingReview ? t("common.sending") : t("review.submit")}
            </Button>
          </div>
        </Modal>

        {order && (
          <RefundRequestModal
            isOpen={showRefundModal}
            onClose={() => setShowRefundModal(false)}
            orderId={order.id}
            orderNumber={order.orderNumber}
            phase={inferRefundPhase()}
            quantity={order.items?.[0]?.quantity ?? 1}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["order", orderId] });
            }}
          />
        )}
      </main>
    </div>
  );
}
