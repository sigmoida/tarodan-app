/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import {
  EllipsisHorizontalIcon,
  TagIcon,
  ClockIcon,
  CalendarIcon,
  ChatBubbleLeftIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  Badge,
  Button,
  IconButton,
  StatusBadge,
  offerStatusConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import UserAvatar from "@/components/UserAvatar";
import { useLocale, useTranslations } from "next-intl";
import { getProductEffectivePrice } from "@/lib/productPrice";
import {
  calculateDiscount,
  formatTimeAgo,
  getOfferImage,
  getTimeRemaining,
  isOfferOrderPaid,
  offerStatusLabel,
  type Offer,
  type OfferTab,
} from "../_lib/types";

interface OfferCardProps {
  offer: Offer;
  activeTab: OfferTab;
  estimatedNet?: number;
  busy: boolean;
  onAction: (offerId: string, action: "accept" | "reject" | "cancel") => void;
  onSellerCounter: (offer: Offer) => void;
  onBuyerCounter: (offer: Offer) => void;
}

export default function OfferCard({
  offer,
  activeTab,
  estimatedNet,
  busy,
  onAction,
  onSellerCounter,
  onBuyerCounter,
}: OfferCardProps) {
  const locale = useLocale();
  const t = useTranslations();

  const listingPrice = getProductEffectivePrice(offer.product);
  const discount = calculateDiscount(offer.amount, listingPrice);
  const timeRemaining =
    offer.status === "pending" ? getTimeRemaining(offer.expiresAt) : null;
  const otherUser = activeTab === "received" ? offer.buyer : offer.seller;
  const paid = isOfferOrderPaid(offer);
  const statusLabel = paid
    ? t("order.statusPaid")
    : offerStatusLabel(
        offer.status,
        locale,
        offerStatusConfig[offer.status]?.label || offer.status,
      );

  const src = getOfferImage(offer);
  const isReceived = activeTab === "received";

  const renderActions = () => {
    if (offer.status === "accepted") {
      const showPay = activeTab === "sent" && !isOfferOrderPaid(offer);
      return (
        <Button asChild variant={showPay ? "success" : "primary"} size="sm">
          <Link
            href={
              offer.orderId
                ? `/profile/orders/${offer.orderId}`
                : "/profile/orders"
            }
          >
            {showPay ? "Ödeme Yap" : "Siparişi Görüntüle"}
          </Link>
        </Button>
      );
    }

    if (offer.status !== "pending") return null;

    // Received counter sent → waiting on the buyer.
    if (isReceived && offer.buyerMustAccept) {
      return (
        <span className="rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700">
          Alıcının karşı teklifinizi yanıtlaması bekleniyor.
        </span>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            aria-label="İşlemler"
            variant="ghost"
            size="sm"
            isLoading={busy}
          >
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isReceived ? (
            <>
              <DropdownMenuItem onSelect={() => onAction(offer.id, "accept")}>
                <CheckIcon className="mr-2 h-4 w-4" />
                Kabul Et
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSellerCounter(offer)}>
                <ArrowTrendingUpIcon className="mr-2 h-4 w-4" />
                Karşı Teklif
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                danger
                onSelect={() => onAction(offer.id, "reject")}
              >
                <XMarkIcon className="mr-2 h-4 w-4" />
                Reddet
              </DropdownMenuItem>
            </>
          ) : offer.buyerMustAccept ? (
            <>
              <DropdownMenuItem onSelect={() => onAction(offer.id, "accept")}>
                <CheckIcon className="mr-2 h-4 w-4" />
                Karşı Teklifi Kabul Et
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onBuyerCounter(offer)}>
                <ArrowTrendingDownIcon className="mr-2 h-4 w-4" />
                Daha Düşük Teklif
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                danger
                onSelect={() => onAction(offer.id, "reject")}
              >
                <XMarkIcon className="mr-2 h-4 w-4" />
                Reddet
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              danger
              onSelect={() => onAction(offer.id, "cancel")}
            >
              <XMarkIcon className="mr-2 h-4 w-4" />
              İptal Et
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated transition-shadow hover:shadow-md">
      <div className="flex flex-col md:flex-row">
        {/* Media */}
        <Link
          href={`/listings/${offer.product.id}`}
          className="group relative h-48 w-full flex-shrink-0 md:h-auto md:w-48"
        >
          {src ? (
            <OptimizedImage
              src={src}
              alt={offer.product.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün"
              logContext={{ productId: offer.product.id, page: "offers" }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary-100">
              <TagIcon className="h-10 w-10 text-primary-400" />
            </div>
          )}
          {discount > 0 && (
            <div className="absolute left-3 top-3">
              <Badge
                variant="danger"
                size="sm"
                icon={<ArrowTrendingDownIcon className="h-3.5 w-3.5" />}
              >
                %{discount}
              </Badge>
            </div>
          )}
        </Link>

        {/* Content */}
        <div className="flex-1 p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Link
                href={`/listings/${offer.product.id}`}
                className="line-clamp-1 text-lg font-semibold text-heading transition-colors hover:text-primary-500"
              >
                {offer.product.title}
              </Link>
              <p className="mt-1 text-sm text-muted">
                İlan Fiyatı:{" "}
                <span className="line-through">
                  ₺{listingPrice.toLocaleString("tr-TR")}
                </span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge
                status={offer.status}
                config={offerStatusConfig}
                label={statusLabel}
              />
              {offer.status === "cancelled" && offer.cancelReason && (
                <p className="text-xs text-muted">{offer.cancelReason}</p>
              )}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3 sm:gap-6">
            <div className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 sm:px-4 sm:py-3">
              <p className="mb-0.5 text-2xs text-muted sm:mb-1 sm:text-xs">
                Teklif Tutarı
              </p>
              <p className="text-lg font-bold text-primary-600 sm:text-2xl">
                ₺{offer.amount.toLocaleString("tr-TR")}
              </p>
              {isReceived &&
                offer.status === "pending" &&
                estimatedNet != null && (
                  <p className="mt-1 text-xs text-success-600">
                    Tahmini net: ₺
                    {Number(estimatedNet).toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                )}
            </div>

            {otherUser && (
              <div className="flex items-center gap-2 sm:gap-3">
                <UserAvatar
                  displayName={otherUser.displayName}
                  avatarUrl={otherUser.avatarUrl}
                  size="sm"
                />
                <div>
                  <p className="text-2xs text-muted sm:text-xs">
                    {isReceived ? "Teklif Veren" : "Satıcı"}
                  </p>
                  <p className="text-sm font-medium text-heading sm:text-base">
                    {otherUser.displayName}
                  </p>
                </div>
              </div>
            )}

            {timeRemaining && (
              <div className="flex items-center gap-1.5 rounded-lg bg-warning-50 px-2 py-1.5 text-warning-600 sm:gap-2 sm:px-3 sm:py-2">
                <ClockIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="whitespace-nowrap text-xs font-medium sm:text-sm">
                  {timeRemaining} kaldı
                </span>
              </div>
            )}
          </div>

          {offer.message && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-surface p-3">
              <ChatBubbleLeftIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-subtle" />
              <p className="text-sm italic text-muted">
                &quot;{offer.message}&quot;
              </p>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border-subtle pt-3">
            <div className="flex items-center gap-2 text-sm text-subtle">
              <CalendarIcon className="h-4 w-4" />
              <span>{formatTimeAgo(offer.createdAt, locale)}</span>
            </div>
            {renderActions()}
          </div>
        </div>
      </div>
    </div>
  );
}
