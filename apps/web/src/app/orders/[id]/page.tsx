"use client";

import { ButtonLink } from "@/components/ui/ButtonLink";
import { useState, useEffect } from "react";
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
} from "@/lib/api";
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
  StarIcon as StarOutlineIcon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "@/i18n/LanguageContext";
import CityDistrictSelector from "@/components/CityDistrictSelector";
import UserAvatar from "@/components/UserAvatar";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Radio,
  Spinner,
  StatusBadge,
  Textarea,
  orderStatusConfig,
} from "@tarodan/ui";

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
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
    totalAmount: number;
    sellerNetAmount: number;
  };
  createdAt: string;
  updatedAt: string;
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
    trackingNumber: string;
    status: string;
    cost?: number;
  };
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

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const { t, locale } = useTranslation();
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
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
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

  // Card states (mirrors checkout)
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

  const invalidateOrder = () =>
    queryClient
      .invalidateQueries({ queryKey: ["order", orderId] })
      .then(() => queryClient.invalidateQueries({ queryKey: ["orders"] }));

  const REVIEWABLE_STATUSES = ["completed", "delivered"];
  const canReview = (o: OrderDetail) =>
    o.isBuyer &&
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

    if (!cardsFetched) {
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
    }
  }, [
    isPendingPaymentBuyer,
    addressesFetched,
    cardsFetched,
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

      // PayTR mode: redirect
      if (data?.paymentUrl) {
        // Save card before redirecting
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

  const handleRefund = async () => {
    toast(locale === "en" ? "Coming soon" : "Yakında gelecektir");
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
    if (!orderId) return;
    setDownloadingInvoice(true);
    try {
      const invoiceRes = await api.get(`/invoices/order/${orderId}`);
      const invoice = invoiceRes.data;
      if (!invoice?.id) {
        toast.error(
          locale === "en" ? "Invoice not found" : "Fatura bulunamadı",
        );
        return;
      }
      const response = await api.get(`/invoices/download/${invoice.id}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `fatura-${invoice.invoiceNumber || invoice.id}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(
        locale === "en" ? "Invoice downloaded" : "Fatura indirildi",
      );
    } catch (err: any) {
      const msg = err.response?.data?.message;
      if (err.response?.status === 404) {
        toast.error(
          msg || (locale === "en" ? "Invoice not found" : "Fatura bulunamadı"),
        );
      } else if (err.response?.status === 400 && msg) {
        toast.error(msg);
      } else {
        toast.error(
          msg || (locale === "en" ? "Download failed" : "İndirme başarısız"),
        );
      }
    } finally {
      setDownloadingInvoice(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  // Not logged in: show message + link (no redirect – like cart page; avoids flash to login then home)
  if (!authLoading && !isAuthenticated) {
    const loginUrl = `/login?redirect=${encodeURIComponent(`/orders/${orderId}`)}`;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-gray-600 mb-4">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">
          {locale === "en" ? "Order not found" : "Sipariş bulunamadı"}
        </p>
      </div>
    );
  }

  const statusLabel = getOrderStatusLabel(order.status);
  const orderAmount = Number(order.totalAmount) || Number(order.amount) || 0;
  const productInfo = order.product || order.items?.[0]?.product;
  const productImage =
    productInfo?.imageUrl || order.items?.[0]?.product?.imageUrl;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/orders"
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">
              Sipariş #{order.orderNumber}
            </h1>
            <p className="text-sm text-gray-500">
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
            status={order.status}
            config={orderStatusConfig}
            label={statusLabel}
          />
        </div>

        {/* İptal edilmiş teklif siparişi: alıcı ödemeyi tamamlamak için yeniden aktive edebilir */}
        {order.status === "cancelled" && order.offerId && order.isBuyer && (
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
                <Spinner size="sm" color="border-white border-t-transparent" />
              ) : (
                <CreditCardIcon className="w-5 h-5" />
              )}
              {locale === "en" ? "Complete payment" : "Ödemeyi tamamla"}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Product Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {locale === "en" ? "Product Information" : "Ürün Bilgileri"}
              </h2>
              <div className="flex gap-4">
                <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
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
                    <div className="w-full h-full flex items-center justify-center bg-gray-50">
                      <TagIcon className="w-8 h-8 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <Link
                    href={`/listings/${productInfo?.id}`}
                    className="text-lg font-medium text-gray-900 hover:text-primary-500 transition-colors"
                  >
                    {productInfo?.title ||
                      (locale === "en" ? "Product" : "Ürün")}
                  </Link>
                  <p className="text-sm text-gray-500 mt-1">
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

            {/* Shipping Info */}
            {order.shipment && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TruckIcon className="w-5 h-5" />
                  {locale === "en" ? "Shipping Information" : "Kargo Bilgileri"}
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      {locale === "en" ? "Carrier:" : "Kargo Firması:"}
                    </span>
                    <span className="font-medium">
                      {order.shipment.provider}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      {locale === "en" ? "Tracking Number:" : "Takip Numarası:"}
                    </span>
                    <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                      {order.shipment.trackingNumber}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      {locale === "en" ? "Shipping Status:" : "Kargo Durumu:"}
                    </span>
                    <span className="font-medium">{order.shipment.status}</span>
                  </div>
                  {order.isBuyer && (
                    <Link
                      href={`/track-order?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(user?.email || "")}`}
                      className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-info-600 hover:bg-info-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <TruckIcon className="w-4 h-4" />
                      {t("order.trackOrder")}
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Shipping Address - sadece ödeme bekleyen alıcı değilse göster (alıcı için adres ödeme kartının içinde) */}
            {order.shippingAddress &&
              !(order.isBuyer && order.status === "pending_payment") && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <MapPinIcon className="w-5 h-5" />
                    Teslimat Adresi
                  </h2>
                  <div className="text-gray-700">
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
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
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
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {locale === "en"
                    ? "Enter Shipping Info"
                    : "Kargo Bilgisi Gir"}
                </h2>
                <p className="text-gray-600 mb-4">
                  {locale === "en"
                    ? "Please enter tracking number when shipped."
                    : "Kargoya verdiğinizde takip numarasını girmeniz gerekmektedir."}
                </p>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() =>
                    toast(
                      locale === "en"
                        ? "Shipping info feature is under development..."
                        : "Kargo bilgisi girme özelliği geliştiriliyor...",
                    )
                  }
                >
                  {locale === "en"
                    ? "Enter Shipping Info"
                    : "Kargo Bilgisi Gir"}
                </Button>
              </div>
            )}

            {/* Pending Payment – Buyer: full checkout (address + card + pay) */}
            {order.isBuyer && order.status === "pending_payment" && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Header banner */}
                <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
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
                  {cardError && (
                    <div className="flex items-center gap-2 p-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
                      <span aria-hidden>!</span>
                      {cardError}
                    </div>
                  )}

                  {/* Section 1: Teslimat Adresi - kayıtlı adreslerden seç veya yeni adres ekle (normal ödeme gibi) */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                        1
                      </span>
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <MapPinIcon className="w-5 h-5 text-primary-500" />
                        {locale === "en"
                          ? "Delivery Address"
                          : "Teslimat Adresi"}
                      </h3>
                    </div>

                    {!addressesFetched ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                        <Spinner
                          size="sm"
                          color="border-gray-300 border-t-primary-500"
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
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <Radio
                              name="shippingAddress"
                              checked={selectedAddressId === addr.id}
                              onChange={() => setSelectedAddressId(addr.id)}
                              className="text-primary-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                {addr.title || addr.fullName}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">
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

                  {/* Section 2: Card Information */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                        2
                      </span>
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <CreditCardIcon className="w-5 h-5 text-primary-500" />
                        {locale === "en"
                          ? "Card Information"
                          : "Kart Bilgileri"}
                      </h3>
                    </div>

                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      {/* Saved Cards */}
                      {savedCards.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-gray-700 mb-3">
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
                                    : "border-gray-200 hover:border-gray-300"
                                }`}
                              >
                                <Radio
                                  name="savedCard"
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
                                  <p className="font-medium text-gray-900">
                                    {card.cardBrand} •••• {card.lastFour}
                                  </p>
                                  <p className="text-sm text-gray-500">
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

                            {/* New Card Option */}
                            <label
                              className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                useNewCard
                                  ? "border-primary-500 bg-primary-50"
                                  : "border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              <Radio
                                name="savedCard"
                                checked={useNewCard}
                                onChange={() => setUseNewCard(true)}
                                className="text-primary-500"
                              />
                              <div className="flex items-center gap-2">
                                <PlusIcon className="w-5 h-5 text-gray-500" />
                                <span className="font-medium text-gray-900">
                                  {locale === "en"
                                    ? "Pay with New Card"
                                    : "Yeni Kart ile Öde"}
                                </span>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* New Card Form */}
                      {(savedCards.length === 0 || useNewCard) && (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                              <label className="block text-sm font-medium text-gray-700 mb-1">
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
                              <label className="block text-sm font-medium text-gray-700 mb-1">
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

                      {/* CVV for saved card */}
                      {!useNewCard && selectedSavedCard && (
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
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

                      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                        <ShieldCheckIcon className="w-4 h-4 text-success-500" />
                        {locale === "en"
                          ? "256-bit SSL encrypted secure payment"
                          : "256-bit SSL ile şifrelenmiş güvenli ödeme"}
                      </div>
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

            {/* Actions for Buyer */}
            {order.isBuyer && order.status === "delivered" && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {locale === "en" ? "Delivery Confirmation" : "Teslimat Onayı"}
                </h2>
                <Button
                  variant="success"
                  size="lg"
                  className="w-full"
                  onClick={() => handleUpdateStatus("completed")}
                >
                  {locale === "en"
                    ? "Received - Complete Order"
                    : "Teslim Aldım - Siparişi Tamamla"}
                </Button>
              </div>
            )}

            {/* Yorum Yap - Sadece alınan siparişlerde, teslim/tamamlandıktan sonra */}
            {canReview(order) && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {t("review.reviewOrder")}
                </h2>
                <p className="text-sm text-gray-600 mb-4">
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

            {/* Refund Button for Completed Payments - Only buyer can request refund */}
            {order.payment &&
              order.payment.status === "completed" &&
              order.isBuyer && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    {locale === "en" ? "Refund" : "İade İşlemi"}
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    {locale === "en"
                      ? "Payment completed. You can start a refund if needed."
                      : "Ödeme tamamlandı. Gerekirse iade işlemi başlatabilirsiniz."}
                  </p>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full flex items-center justify-center gap-2"
                    disabled
                    onClick={handleRefund}
                  >
                    <ArrowUturnLeftIcon className="w-5 h-5" />
                    {locale === "en" ? "Request Refund" : "İade Talebi Oluştur"}
                  </Button>
                </div>
              )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Order Summary */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5" />
                {locale === "en" ? "Order Summary" : "Sipariş Özeti"}
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between text-gray-600">
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
                <div className="flex justify-between text-gray-600">
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
                {(order.pricing?.buyerFeeAmount ?? order.buyerFeeAmount ?? 0) >
                  0 && (
                  <div className="flex justify-between text-gray-600">
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
                      <div className="flex justify-between text-gray-600">
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
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
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
                className="flex items-center gap-3 hover:bg-gray-50 -mx-2 px-2 py-2 rounded-lg transition-colors"
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
                  <p className="font-medium text-gray-900">
                    {order.isBuyer
                      ? order.seller.displayName
                      : order.buyer.displayName}
                  </p>
                  <p className="text-sm text-gray-500">
                    {locale === "en" ? "View Profile" : "Profili Gör"}
                  </p>
                </div>
              </Link>
            </div>

            {/* Invoice Section - Show only for paid orders */}
            {order.status !== "pending_payment" &&
              order.status !== "cancelled" && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
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
                      <p className="text-sm text-success-800 mb-2">
                        {locale === "en"
                          ? "Your invoice has been sent to your email address after the payment was completed."
                          : "Faturanız ödeme tamamlandıktan sonra e-posta adresinize gönderildi."}
                      </p>
                      {order.isBuyer && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={handleDownloadInvoice}
                          disabled={downloadingInvoice}
                        >
                          {downloadingInvoice
                            ? locale === "en"
                              ? "Downloading..."
                              : "İndiriliyor..."
                            : t("order.downloadInvoice")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

            {/* Help */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {locale === "en" ? "Help" : "Yardım"}
              </h2>
              <div className="space-y-2">
                <Button
                  variant="secondary"
                  className="w-full text-left px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {locale === "en"
                    ? "Report Order Issue"
                    : "Sipariş Sorunu Bildir"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleRefund}
                  className="w-full text-left px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {locale === "en" ? "Request Refund" : "İade Talebi Oluştur"}
                </Button>
                <Link
                  href="/support"
                  className="block w-full text-left px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
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
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              📦 {t("review.productReview")}
            </h3>

            {(order.product || order.items?.[0]?.product) && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-2xl overflow-hidden">
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
                <p className="font-medium text-gray-900">
                  {order.product?.title || order.items?.[0]?.product?.title}
                </p>
              </div>
            )}

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      <StarOutlineIcon className="w-8 h-8 text-gray-300" />
                    )}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {locale === "en"
                  ? "Photos (optional, max 5)"
                  : "Fotoğraflar (opsiyonel, maks 5)"}
              </label>
              <div className="flex flex-wrap gap-2">
                {reviewImagePreviews.map((src, idx) => (
                  <div
                    key={idx}
                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200"
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
                      className="absolute top-0 right-0 bg-danger-500 text-white rounded-bl-lg w-5 h-5 flex items-center justify-center text-xs"
                    >
                      ×
                    </Button>
                  </div>
                ))}
                {reviewImages.length < 5 && (
                  <label className="w-16 h-16 border-2 border-dashed items-center justify-center cursor-pointer hover:border-primary-400">
                    <span className="text-2xl text-gray-400">+</span>
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

          <div className="border-t border-gray-200 my-6"></div>

          {/* Seller Section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              👤 {t("review.sellerReview")}
            </h3>

            {order.seller && (
              <p className="text-sm text-gray-600 mb-4">
                {t("product.seller")}:{" "}
                <span className="font-medium text-gray-900">
                  {order.seller.displayName}
                </span>
              </p>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">
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
                        <StarOutlineIcon className="w-5 h-5 text-gray-300" />
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">
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
                        <StarOutlineIcon className="w-5 h-5 text-gray-300" />
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">
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
                        <StarOutlineIcon className="w-5 h-5 text-gray-300" />
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("review.sellerComment")}
                </label>
                <Textarea
                  value={sellerReviewText}
                  onChange={(e) => setSellerReviewText(e.target.value)}
                  placeholder={t("review.sellerCommentPlaceholder")}
                  className="border-gray-200 resize-none"
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
      </main>
    </div>
  );
}
