/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { StatusBadge, orderStatusConfig } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import { Button } from "@tarodan/ui";
import {
  formatTL,
  getOrderPrimary,
  isGroupCancellable,
  productAmountOf,
  sellerNetOf,
  visibleCargoCode,
  type Order,
  type ServerOrderGroup,
} from "../_lib/types";
import { getDisplayStatus } from "../_lib/status";
import OrderActions, { type OrderActionHandlers } from "./OrderActions";
import { publicNameOf } from "@/lib/public-name";

const PLACEHOLDER =
  "https://placehold.co/128x128/f3f4f6/9ca3af?text=%F0%9F%9A%97";

/**
 * One product line inside the umbrella: image + title + qty×price + per-item
 * status + amount + the shared per-order actions.
 */
function OrderLine({
  order,
  actions,
}: {
  order: Order;
  actions: OrderActionHandlers;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const display = getDisplayStatus(order, t, locale);
  const { product, image } = getOrderPrimary(order);
  // Kartta ürün bedeli gösterilir; alıcının ödediği toplam DEĞİL (bkz.
  // productAmountOf). Değer yoksa tutar hiç basılmaz.
  const productAmount = productAmountOf(order);
  const net = sellerNetOf(order);
  const quantity = order.items?.[0]?.quantity ?? 1;
  const unitPrice =
    productAmount != null && quantity > 0 ? productAmount / quantity : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-4">
        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt">
          <OptimizedImage
            src={image || PLACEHOLDER}
            alt={product?.title ?? ""}
            fill
            sizes="56px"
            className="object-cover"
            fallbackSrc={PLACEHOLDER}
            logContext={{ orderId: order.id, page: "orders-line" }}
          />
        </div>
        <div className="min-w-0 flex-1">
          {product ? (
            <Link
              href={`/listings/${product.id}`}
              className="font-medium text-heading transition-colors hover:text-primary-600"
            >
              {product.title || t("order.product")}
            </Link>
          ) : (
            <p className="text-muted">{t("order.productInfoUnavailable")}</p>
          )}
          <p className="text-sm text-muted">
            {unitPrice != null
              ? `${quantity} ${t("order.unitTimes")} ${formatTL(unitPrice)}`
              : `${quantity} ${t("order.unitOnly")}`}
          </p>
          <p className="mt-0.5 text-xs text-subtle">
            {t("order.orderNumber")} #{order.orderNumber}
          </p>
          <p className="mt-1.5 text-sm text-muted">
            {order.isSeller
              ? `${t("order.buyer")}: ${publicNameOf(order.buyer, "-")}`
              : `${t("product.seller")}: ${publicNameOf(order.seller, t("product.seller"))}`}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <StatusBadge
            status={display.status}
            config={orderStatusConfig}
            label={display.label}
            size="sm"
          />
          {productAmount != null && (
            <p className="text-base font-semibold text-primary-500">
              {formatTL(productAmount)}
            </p>
          )}
          {order.isSeller && net != null && (
            <p className="text-xs text-success-600">
              {t("order.netToYou")}: {formatTL(net)}
            </p>
          )}
        </div>
      </div>

      <OrderActions order={order} {...actions} />
    </div>
  );
}

interface OrderGroupCardProps {
  group: ServerOrderGroup;
  actions: OrderActionHandlers;
  /** Grup iptali (R4): iptal SEPET bazındadır — kartta tek buton. */
  onCancelGroup: (group: ServerOrderGroup) => void;
}

/**
 * The single "çatı" (umbrella) card for BOTH single and multi orders — now fed
 * by the server group row: packages carry the per-parcel shipping fee + shared
 * cargo, `payment` is the ONE charge of the whole cart (buyer view only).
 */
export default function OrderGroupCard({
  group,
  actions,
  onCancelGroup,
}: OrderGroupCardProps) {
  const t = useTranslations();
  const date = group.createdAt;
  const multiPackage = group.packages.length > 1;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
      {/* Umbrella header — tek ve çok ürünlü sepette aynı düzen */}
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            {/* Başlık YALNIZ sepet numarasıdır: sipariş numarası her satırda,
                kargo numarası paket altında zaten yazıyor. */}
            <p className="font-mono text-sm text-muted">{group.groupNumber}</p>
            <p className="text-sm text-subtle">{formatDate(date)}</p>
          </div>
          {/* Sepet toplamı başlıktan KALDIRILDI: satış sekmesinde alıcının
              ödediği tutarı satıcıya gösteriyordu, alış sekmesinde de satırların
              ürün bedeliyle toplanmayan bir rakam olarak kafa karıştırıyordu.
              Ödeme dökümü sipariş detayındaki özet kartında duruyor. */}
          <div className="flex items-center gap-3">
            {isGroupCancellable(group) && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => onCancelGroup(group)}
              >
                {group.orders.length > 1
                  ? t("order.cancelGroupTitle")
                  : t("order.cancelShort")}
              </Button>
            )}
            <ButtonLink
              href={`/profile/orders/${group.orders[0]?.id}`}
              variant="outline"
              size="sm"
            >
              {t("common.details")}
            </ButtonLink>
          </div>
        </div>
      </div>

      {/* Body — product line(s) grouped per seller-package ("çatı"). Same seller =
          one parcel = ONE tracking + ONE shipping fee, shown once per package. */}
      <div className="space-y-4 border-t border-border-subtle p-4 sm:p-6">
        {group.packages.map((pkg) => {
          const cargoCode = visibleCargoCode(pkg.cargo);
          return (
            <div
              key={pkg.id}
              className={
                multiPackage ? "ml-3 border-l-2 border-primary-300 pl-4" : ""
              }
            >
              {multiPackage && (
                <p className="mb-2 text-sm font-medium text-heading">
                  {pkg.seller
                    ? t("order.sellerPackage", {
                        name: publicNameOf(pkg.seller),
                      })
                    : t("order.multiItemOrder")}
                </p>
              )}
              <div className="space-y-3">
                {pkg.orders.map((order) => (
                  <OrderLine key={order.id} order={order} actions={actions} />
                ))}
              </div>
              {/* Kargo bedeli burada GÖSTERİLMEZ: kart tutarı zaten sepetin
                  ödenen toplamıdır, kalem kalem döküm detay sayfasındadır. */}
              {(pkg.packageNumber || cargoCode) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-surface-alt p-3 text-sm">
                  {/* Teslimat no: bu kutudaki ürünler TEK kolide gider. Sürat'a
                      giden ve kargo etiketinde yazan kod budur. */}
                  {pkg.packageNumber && (
                    <p>
                      <span className="text-muted">
                        {t("order.packageNumber")}:
                      </span>{" "}
                      <span className="font-mono">{pkg.packageNumber}</span>
                    </p>
                  )}
                  {/* Taşıyıcının kendi kodu — Sürat barkodu oluştuğunda dolar. */}
                  {cargoCode ? (
                    <p>
                      <span className="text-muted">
                        {t("order.trackingNumber")}:
                      </span>{" "}
                      <span className="font-mono">{cargoCode}</span>
                    </p>
                  ) : (
                    /* Kod yalnız koli şubede kabul edildikten sonra doluyor. O
                       aralıkta hiçbir şey yazmamak, kullanıcıyı koli numarasını
                       takip numarası sanıp taşıyıcı sitesinde aramaya itiyordu. */
                    pkg.cargo?.shippedAt && (
                      <p className="text-muted">
                        {t("order.cargoCodePending")}
                      </p>
                    )
                  )}
                  {/* Takip TESLİMAT başına tektir — sorgu anahtarı da bu koddur. */}
                  {(pkg.packageNumber || cargoCode) &&
                    group.viewerRole === "buyer" && (
                      <ButtonLink
                        href={`/track-order?orderNumber=${encodeURIComponent(
                          pkg.packageNumber ?? pkg.orders[0]?.orderNumber ?? "",
                        )}&email=${encodeURIComponent(actions.userEmail || "")}`}
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                      >
                        {t("order.trackOrder")}
                      </ButtonLink>
                    )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
