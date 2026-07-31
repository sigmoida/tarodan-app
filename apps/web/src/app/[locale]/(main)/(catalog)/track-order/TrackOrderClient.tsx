/** @format */

"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  ChevronRightIcon,
  TruckIcon,
  MapPinIcon,
  MagnifyingGlassIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import { Button, Spinner, StatusBadge, orderStatusConfig } from "@tarodan/ui";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import { useLocale, useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useTrackOrder } from "./_hooks/useTrackOrder";
import { trackOrderSchema } from "./_lib/schema";

export default function TrackOrderClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Geri: tarayıcı geçmişi varsa önceki sayfaya (sipariş listesi/detayı) dön,
  // yoksa (doğrudan/derin link) anasayfaya düş.
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };
  const locale = useLocale();
  const t = useTranslations();
  const {
    order,
    loading,
    error,
    getOrderStatusLabel,
    lookup,
    reset,
    initialValues,
  } = useTrackOrder(locale);
  const form = useZodForm(trackOrderSchema(locale), {
    defaultValues: initialValues,
  });

  const statusLabel = order ? getOrderStatusLabel(order.status) : null;
  const shipAddr = order?.shippingAddress as Record<string, string> | undefined;

  return (
    <PageShell className="pb-8">
      <PageHeader
        onBack={handleBack}
        title={t("order.trackOrder")}
        description={t("order.trackDescription")}
      />

      {!order ? (
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
          {loading &&
          searchParams.get("orderNumber") &&
          searchParams.get("email") ? (
            <div className="py-12 flex flex-col items-center justify-center gap-4">
              <Spinner size="lg" />
              <p className="text-muted">{t("order.loadingDetails")}</p>
            </div>
          ) : (
            <>
              <p className="text-muted mb-4">{t("order.trackInstructions")}</p>
              <Form
                form={form}
                onSubmit={(v) => lookup(v, { toastOnError: true })}
                className="space-y-4"
              >
                <FormInput
                  name="orderNumber"
                  label={`${t("order.orderNumber")} *`}
                  placeholder="örn. ORD-K7X9M2QF3N"
                />
                <FormInput
                  name="email"
                  type="email"
                  label={`${t("auth.emailAddress")} *`}
                  placeholder="siparişte kullandığınız e-posta"
                />
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
                  {t("order.viewOrder")}
                </Button>
              </Form>
              <p className="text-sm text-muted mt-4">
                {t("order.orderNumberHint")}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-bold text-heading">
                {t("order.order")} #{order.orderNumber}
              </h2>
              <p className="text-sm text-muted mt-1">
                {new Date(order.createdAt).toLocaleDateString(
                  t("common.dateLocale"),
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}
              </p>
              {order.siblingOrderNumbers &&
                order.siblingOrderNumbers.length > 0 && (
                  <p className="text-sm text-muted mt-2">
                    {t("order.cartSiblings")}{" "}
                    {order.siblingOrderNumbers.map((num, i) => (
                      <span key={num} className="font-mono">
                        {i > 0 && ", "}
                        {num}
                      </span>
                    ))}
                  </p>
                )}
            </div>
            <StatusBadge
              status={order.status}
              config={orderStatusConfig}
              label={statusLabel!}
            />
          </div>

          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <h3 className="font-semibold text-heading mb-3">
              {t("order.product")}
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

          {order.shipment &&
            (() => {
              // Sipariş durumu elle ilerletildiğinde shipment.status geride kalabiliyor;
              // yanıltıcı "hazırlanıyor" bilgisi göstermemek için sipariş durumundan
              // etkin kargo durumu türet (bkz. orders/[id] aynı mantık).
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
              if (orderDelivered && s !== "delivered" && !isReturnFlow) {
                s = "delivered";
              } else if (
                orderShipped &&
                (s === "pending" || s === "label_created")
              ) {
                s = "in_transit";
              }

              const isPending = s === "pending";
              const isCancelled = s === "cancelled" || s === "failed";
              const trackingCode =
                order.shipment.cargoCode ??
                (order.shipment.provider !== "surat"
                  ? order.shipment.trackingNumber
                  : null);
              const showTracking = !isPending && !isCancelled && !!trackingCode;

              return (
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h3 className="font-semibold text-heading mb-3 flex items-center gap-2">
                    <TruckIcon className="w-5 h-5 text-primary-500" />
                    {t("checkout.shipping")}
                  </h3>
                  {isPending && (
                    <p className="text-sm bg-info-50 border border-info-200 rounded p-3 text-info-800">
                      {t("order.shipmentPreparing")}
                    </p>
                  )}
                  {isCancelled && (
                    <p className="text-sm bg-danger-50 border border-danger-200 rounded p-3 text-danger-800">
                      {t("order.shipmentCancelled")}
                    </p>
                  )}
                  {showTracking && (
                    <div className="space-y-2 text-body">
                      <p>
                        <span className="text-muted">
                          {t("order.carrier")}:
                        </span>{" "}
                        {order.shipment.provider === "surat"
                          ? "Sürat Kargo"
                          : order.shipment.provider}
                      </p>
                      <p>
                        <span className="text-muted">
                          {t("order.trackingNumber")}:
                        </span>{" "}
                        <span className="font-mono bg-surface-alt px-2 py-1 rounded">
                          {trackingCode}
                        </span>
                      </p>
                      {(order.shipment.trackingUrl ||
                        order.shipment.provider === "surat") && (
                        <a
                          href={
                            order.shipment.trackingUrl ||
                            `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(trackingCode!)}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-primary-500 hover:underline"
                        >
                          {t("order.trackShipment")}
                          <ChevronRightIcon className="ml-1 h-4 w-4" />
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
                {t("checkout.shippingAddress")}
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
                reset();
                form.reset({ orderNumber: "", email: "" });
              }}
              className="flex-1"
            >
              {t("order.trackAnother")}
            </Button>
            <ButtonLink href="/listings" className="flex-1 text-center">
              {t("cart.continueShopping")}
            </ButtonLink>
          </div>
        </div>
      )}
    </PageShell>
  );
}
