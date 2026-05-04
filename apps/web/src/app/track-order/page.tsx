"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeftIcon,
  TruckIcon,
  MapPinIcon,
  MagnifyingGlassIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { ordersApi } from "@/lib/api";
import { useTranslation } from "@/i18n";
import {
  Button,
  Input,
  Spinner,
  StatusBadge,
  orderStatusConfig,
} from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";

interface GuestOrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  product: { id: string; title: string; image?: string };
  seller: { id: string; displayName: string; isVerified?: boolean };
  shippingAddress?: Record<string, string>;
  shipment?: {
    provider: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: string;
    estimatedDelivery?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
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

export default function TrackOrderPage() {
  const searchParams = useSearchParams();
  const { locale } = useTranslation();
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<GuestOrderDetail | null>(null);

  const [autoFetched, setAutoFetched] = useState(false);
  useEffect(() => {
    const orderFromUrl = searchParams.get("orderNumber") || "";
    const emailFromUrl = searchParams.get("email") || "";
    if (orderFromUrl) setOrderNumber(orderFromUrl);
    if (emailFromUrl) setEmail(emailFromUrl);
  }, [searchParams]);

  useEffect(() => {
    const orderFromUrl = searchParams.get("orderNumber")?.trim();
    const emailFromUrl = searchParams.get("email")?.trim();
    if (
      !orderFromUrl ||
      !emailFromUrl ||
      !emailFromUrl.includes("@") ||
      autoFetched
    )
      return;

    const fetchByUrl = async () => {
      setAutoFetched(true);
      setLoading(true);
      setError("");
      setOrder(null);
      try {
        const res = await ordersApi.trackGuest({
          orderNumber: orderFromUrl,
          email: emailFromUrl.toLowerCase(),
        });
        setOrder(res.data);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setError(
            locale === "en"
              ? "Order not found. Check your details."
              : "Sipariş bulunamadı. Bilgileri kontrol edin.",
          );
        } else {
          setError(
            err.response?.data?.message ||
              (locale === "en"
                ? "Could not load order"
                : "Sipariş yüklenemedi"),
          );
        }
      } finally {
        setLoading(false);
      }
    };
    fetchByUrl();
  }, [searchParams, autoFetched, locale]);

  const getOrderStatusLabel = (s: string) =>
    locale === "en"
      ? orderStatusEnLabels[s] || s
      : orderStatusConfig[s]?.label || s;

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!orderNumber.trim()) {
      setError(
        locale === "en" ? "Enter order number" : "Sipariş numarası girin",
      );
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError(
        locale === "en"
          ? "Enter a valid email address"
          : "Geçerli bir e-posta adresi girin",
      );
      return;
    }

    setLoading(true);
    setOrder(null);
    try {
      const res = await ordersApi.trackGuest({
        orderNumber: orderNumber.trim(),
        email: email.trim().toLowerCase(),
      });
      setOrder(res.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError(
          locale === "en"
            ? "Order not found. Check your details."
            : "Sipariş bulunamadı. Bilgileri kontrol edin.",
        );
      } else {
        setError(
          err.response?.data?.message ||
            (locale === "en" ? "Could not load order" : "Sipariş yüklenemedi"),
        );
      }
      toast.error(
        err.response?.data?.message ||
          (locale === "en" ? "Order not found" : "Sipariş bulunamadı"),
      );
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = order ? getOrderStatusLabel(order.status) : null;
  const shipAddr = order?.shippingAddress as Record<string, string> | undefined;

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/"
            className="p-2 hover:bg-border-subtle rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-muted" />
          </Link>
          <h1 className="text-2xl font-bold text-heading">
            {locale === "en" ? "Track your order" : "Sipariş Takip"}
          </h1>
        </div>

        {!order ? (
          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            {loading &&
            searchParams.get("orderNumber") &&
            searchParams.get("email") ? (
              <div className="py-12 flex flex-col items-center justify-center gap-4">
                <Spinner size="lg" />
                <p className="text-muted">
                  {locale === "en"
                    ? "Loading order details..."
                    : "Sipariş bilgileriniz yükleniyor..."}
                </p>
              </div>
            ) : (
              <>
                <p className="text-muted mb-4">
                  {locale === "en"
                    ? "Enter your order number and the email address you used when placing the order to view status and tracking."
                    : "Sipariş numaranız ve siparişte kullandığınız e-posta adresi ile sipariş durumunu ve kargo bilgisini görebilirsiniz."}
                </p>
                <form onSubmit={handleTrack} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">
                      {locale === "en" ? "Order number" : "Sipariş numarası"} *
                    </label>
                    <Input
                      type="text"
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      placeholder="örn. ORD-20260101-XXXX"
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">
                      {locale === "en" ? "Email address" : "E-posta adresi"} *
                    </label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="siparişte kullandığınız e-posta"
                      className="input w-full"
                      required
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-danger-600 bg-danger-50 p-3 rounded-lg">
                      {error}
                    </p>
                  )}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full flex gap-2"
                  >
                    {loading ? (
                      <Spinner
                        size="sm"
                        color="border-surface-elevated border-t-transparent"
                      />
                    ) : (
                      <MagnifyingGlassIcon className="w-5 h-5" />
                    )}
                    {locale === "en" ? "View order" : "Siparişi Görüntüle"}
                  </Button>
                </form>
                <p className="text-sm text-muted mt-4">
                  {locale === "en"
                    ? "You can find the order number in the confirmation email we sent after your purchase."
                    : "Sipariş numarasını, satın alma sonrası gönderdiğimiz onay e-postasında bulabilirsiniz."}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold text-heading">
                  {locale === "en" ? "Order" : "Sipariş"} #{order.orderNumber}
                </h2>
                <p className="text-sm text-muted mt-1">
                  {new Date(order.createdAt).toLocaleDateString(
                    locale === "en" ? "en-US" : "tr-TR",
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
                </p>
              </div>
              <StatusBadge
                status={order.status}
                config={orderStatusConfig}
                label={statusLabel!}
              />
            </div>

            <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
              <h3 className="font-semibold text-heading mb-3">
                {locale === "en" ? "Product" : "Ürün"}
              </h3>
              <div className="flex gap-4">
                <div className="w-20 h-20 bg-surface-alt rounded-lg overflow-hidden flex-shrink-0">
                  {order.product?.image ? (
                    <Image
                      src={order.product.image}
                      alt={order.product.title}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-surface">
                      <TagIcon className="w-6 h-6 text-border-strong" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/listings/${order.product?.id}`}
                    className="font-medium text-heading hover:text-primary-500 line-clamp-2"
                  >
                    {order.product?.title}
                  </Link>
                  <p className="text-lg font-bold text-primary-500 mt-1">
                    {Number(order.totalAmount).toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    TL
                  </p>
                </div>
              </div>
            </div>

            {order.shipment && (() => {
              const s = order.shipment.status;
              const isPending = s === "pending";
              const isCancelled = s === "cancelled" || s === "failed";
              const showTracking =
                !isPending && !isCancelled && !!order.shipment.trackingNumber;

              return (
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h3 className="font-semibold text-heading mb-3 flex items-center gap-2">
                    <TruckIcon className="w-5 h-5 text-primary-500" />
                    {locale === "en" ? "Shipping" : "Kargo"}
                  </h3>
                  {isPending && (
                    <p className="text-sm bg-info-50 border border-info-200 rounded p-3 text-info-800">
                      {locale === "en"
                        ? "The seller is preparing the package. Tracking details will appear once it's handed over to the cargo branch."
                        : "Satıcı paketi hazırlıyor. Kargo şubesine teslim edildiği anda takip bilgileri burada görünecek."}
                    </p>
                  )}
                  {isCancelled && (
                    <p className="text-sm bg-danger-50 border border-danger-200 rounded p-3 text-danger-800">
                      {locale === "en"
                        ? "This shipment has been cancelled."
                        : "Bu kargo iptal edildi."}
                    </p>
                  )}
                  {showTracking && (
                    <div className="space-y-2 text-body">
                      <p>
                        <span className="text-muted">
                          {locale === "en" ? "Carrier:" : "Firma:"}
                        </span>{" "}
                        {order.shipment.provider === "surat"
                          ? "Sürat Kargo"
                          : order.shipment.provider}
                      </p>
                      <p>
                        <span className="text-muted">
                          {locale === "en" ? "Tracking number:" : "Takip no:"}
                        </span>{" "}
                        <span className="font-mono bg-surface-alt px-2 py-1 rounded">
                          {order.shipment.trackingNumber}
                        </span>
                      </p>
                      {(order.shipment.trackingUrl ||
                        order.shipment.provider === "surat") && (
                        <a
                          href={
                            order.shipment.trackingUrl ||
                            `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(order.shipment.trackingNumber!)}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-500 hover:underline"
                        >
                          {locale === "en"
                            ? "Track shipment"
                            : "Kargoyu takip et"}{" "}
                          →
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {shipAddr && (shipAddr.address || shipAddr.fullName) && (
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h3 className="font-semibold text-heading mb-3 flex items-center gap-2">
                  <MapPinIcon className="w-5 h-5 text-primary-500" />
                  {locale === "en" ? "Delivery address" : "Teslimat adresi"}
                </h3>
                <div className="text-body">
                  {shipAddr.fullName && (
                    <p className="font-medium">{shipAddr.fullName}</p>
                  )}
                  {shipAddr.address && <p>{shipAddr.address}</p>}
                  {(shipAddr.district || shipAddr.city) && (
                    <p>
                      {[shipAddr.district, shipAddr.city]
                        .filter(Boolean)
                        .join(", ")}{" "}
                      {shipAddr.zipCode || ""}
                    </p>
                  )}
                  {shipAddr.phone && <p>Tel: {shipAddr.phone}</p>}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setOrder(null);
                  setError("");
                }}
                className="flex-1"
              >
                {locale === "en"
                  ? "Track another order"
                  : "Başka sipariş sorgula"}
              </Button>
              <ButtonLink href="/listings" className="flex-1 text-center">
                {locale === "en" ? "Continue shopping" : "Alışverişe devam et"}
              </ButtonLink>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
