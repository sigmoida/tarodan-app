/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { TruckIcon, MapPinIcon, TagIcon } from "@heroicons/react/24/outline";
import { Button, Spinner, StatusBadge, orderStatusConfig } from "@tarodan/ui";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import { useLocale, useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import { useTrackOrder } from "./_hooks/useTrackOrder";
import { trackOrderSchema } from "./_lib/schema";
import { formatTL } from "@/lib/format";

/** Etiket + değer satırı — kargo ve adres bloklarında tekrar eden desen. */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <p className="text-sm text-body">
      <span className="text-muted">{label}: </span>
      {children}
    </p>
  );
}

export default function TrackOrderClient() {
  const searchParams = useSearchParams();
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
  const looking =
    loading && searchParams.get("orderNumber") && searchParams.get("email");

  return (
    <PageShell className="pb-8">
      <PageHeader
        title={t("order.trackOrder")}
        description={t("order.trackDescription")}
      />

      {!order ? (
        <SectionCard>
          {looking ? (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <Spinner size="lg" />
              <p className="text-muted">{t("order.loadingDetails")}</p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted">
                {t("order.trackInstructions")}
              </p>
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
                {error && <p className="text-sm text-danger-600">{error}</p>}
                <Button
                  type="submit"
                  isLoading={loading}
                  disabled={loading}
                  className="w-full"
                >
                  {t("order.viewOrder")}
                </Button>
              </Form>
              <p className="mt-4 text-sm text-muted">
                {t("order.orderNumberHint")}
              </p>
            </>
          )}
        </SectionCard>
      ) : (
        <>
          <SectionCard>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-heading">
                  {t("order.order")} #{order.orderNumber}
                </h2>
                <p className="mt-1 text-sm text-muted">
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
                {/* Üç kod seviyesi: sepet (GRP) · koli (PKG) · sipariş (ORD).
                    Müşteri hangisini girdiyse diğerlerini de burada görür. */}
                {(order.groupNumber || order.packageNumber) && (
                  <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-muted">
                    {order.groupNumber && (
                      <span>
                        {t("order.groupNumber")}:{" "}
                        <span className="font-mono">{order.groupNumber}</span>
                      </span>
                    )}
                    {order.packageNumber && (
                      <span>
                        {t("order.packageNumber")}:{" "}
                        <span className="font-mono">{order.packageNumber}</span>
                      </span>
                    )}
                  </p>
                )}
                {order.siblingOrderNumbers &&
                  order.siblingOrderNumbers.length > 0 && (
                    <p className="mt-2 text-sm text-muted">
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

            <div className="mt-5 flex gap-4 border-t border-border-subtle pt-5">
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt">
                {order.product?.image ? (
                  <Image
                    src={order.product.image}
                    alt={order.product.title}
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <TagIcon className="h-6 w-6 text-border-strong" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/listings/${order.product?.id}`}
                  className="line-clamp-2 font-medium text-heading hover:text-primary-600"
                >
                  {order.product?.title}
                </Link>
                <p className="mt-1 font-semibold text-heading">
                  {formatTL(Number(order.totalAmount))}
                </p>
              </div>
            </div>
          </SectionCard>

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
                <SectionCard>
                  <h3 className="mb-3 flex items-center gap-2 font-medium text-heading">
                    <TruckIcon className="h-5 w-5 text-muted" />
                    {t("checkout.shipping")}
                  </h3>
                  {isPending && (
                    <p className="text-sm text-muted">
                      {t("order.shipmentPreparing")}
                    </p>
                  )}
                  {isCancelled && (
                    <p className="text-sm text-danger-600">
                      {t("order.shipmentCancelled")}
                    </p>
                  )}
                  {showTracking && (
                    <div className="space-y-1.5">
                      <Row label={t("order.carrier")}>
                        {order.shipment.provider === "surat"
                          ? "Sürat Kargo"
                          : order.shipment.provider}
                      </Row>
                      <Row label={t("order.trackingNumber")}>
                        <span className="font-mono">{trackingCode}</span>
                      </Row>
                      {(order.shipment.trackingUrl ||
                        order.shipment.provider === "surat") && (
                        <a
                          href={
                            order.shipment.trackingUrl ||
                            `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(trackingCode!)}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-sm text-primary-600 hover:underline"
                        >
                          {t("order.trackShipment")}
                        </a>
                      )}
                    </div>
                  )}
                </SectionCard>
              );
            })()}

          {shipAddr && (shipAddr.address || shipAddr.fullName) && (
            <SectionCard>
              <h3 className="mb-3 flex items-center gap-2 font-medium text-heading">
                <MapPinIcon className="h-5 w-5 text-muted" />
                {t("checkout.shippingAddress")}
              </h3>
              <div className="space-y-0.5 text-sm text-body">
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
            </SectionCard>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                reset();
                form.reset({ orderNumber: "", email: "" });
              }}
            >
              {t("order.trackAnother")}
            </Button>
            <ButtonLink variant="outline" href="/listings">
              {t("cart.continueShopping")}
            </ButtonLink>
          </div>
        </>
      )}
    </PageShell>
  );
}
