/** @format */

import { Link } from "@/i18n/navigation";
import {
  ArrowsRightLeftIcon,
  ChevronLeftIcon,
} from "@heroicons/react/24/outline";
import { Button, Checkbox, Input, Radio, Spinner, Textarea } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { getProductEffectivePrice } from "@/lib/productPrice";
import { getProductImage } from "../_lib/types";
import type { TradeDetailVM } from "../_hooks/useTradeDetail";

/**
 * Full-screen counter-offer edit mode — replaces the whole detail view while
 * `isCounterMode` is on. Two product pickers (want / offer) + cash difference +
 * message, mirroring the original inline editor exactly.
 */
export default function CounterOfferEditor({ vm }: { vm: TradeDetailVM }) {
  const {
    t,
    isLoadingCounterData,
    counterTargetProducts,
    selectedCounterTargetProducts,
    toggleCounterTargetProduct,
    counterProducts,
    selectedCounterProducts,
    toggleCounterProduct,
    counterCashAmount,
    setCounterCashAmount,
    counterCashPayer,
    setCounterCashPayer,
    counterMessage,
    setCounterMessage,
    isActionLoading,
    handleCounterSubmit,
    handleExitCounterMode,
  } = vm;

  return (
    <div className="min-h-screen bg-surface py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="secondary"
            onClick={handleExitCounterMode}
            className="mb-4 gap-1"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            {t("trade.backToTrade")}
          </Button>
          <h1 className="text-3xl font-bold text-heading">
            {t("trade.counterOffer")}
          </h1>
          <p className="text-muted mt-2">{t("trade.counterOfferModify")}</p>
        </div>

        {isLoadingCounterData ? (
          <div className="text-center py-12">
            <Spinner
              size="lg"
              color="border-primary-500 border-t-transparent"
              className="mx-auto mb-4"
            />
            <p className="text-muted">{t("trade.loadingProducts")}</p>
          </div>
        ) : (
          <>
            {/* Products Comparison - Side by Side */}
            <div className="flex flex-col lg:flex-row items-stretch gap-6 mb-6">
              {/* SOL - İstenilen Ürünler */}
              <div className="bg-surface-elevated rounded-xl p-6 shadow-sm border border-border flex-1">
                <h2 className="text-lg font-semibold text-heading mb-4">
                  {t("trade.productsYouWant")}
                </h2>
                {counterTargetProducts.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted">
                      {t("trade.noProductsFromSeller")}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
                    {counterTargetProducts.map((product) => {
                      const isSelected = selectedCounterTargetProducts.includes(
                        product.id,
                      );
                      return (
                        <label
                          key={product.id}
                          className={`relative block w-full cursor-pointer rounded-xl border-2 p-4 transition-all ${
                            isSelected
                              ? "border-primary-500 ring-2 ring-primary-200"
                              : "border-border hover:border-primary-300"
                          }`}
                        >
                          <div className="absolute top-2 right-2 z-10">
                            <Checkbox
                              checked={isSelected}
                              onChange={() =>
                                toggleCounterTargetProduct(product.id)
                              }
                            />
                          </div>
                          <div className="flex flex-col items-center gap-3">
                            <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-surface-alt">
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
                            <div className="text-center w-full">
                              <h3 className="font-medium text-heading text-sm line-clamp-2 mb-1">
                                {product.title}
                              </h3>
                              <p className="text-base font-bold text-primary-500">
                                {getProductEffectivePrice(
                                  product,
                                ).toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}{" "}
                                TL
                              </p>
                            </div>
                          </div>
                        </label>
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
                  {t("trade.productsYouOffer")}
                </h2>
                {counterProducts.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted mb-4">
                      {t("trade.noProductsAvailable")}
                    </p>
                    <Link
                      href="/profile/listings"
                      className="text-primary-500 hover:text-primary-600 font-medium"
                    >
                      {t("trade.goToMyListings")}
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
                    {counterProducts.map((product) => {
                      const isSelected = selectedCounterProducts.includes(
                        product.id,
                      );
                      return (
                        <label
                          key={product.id}
                          className={`relative block w-full cursor-pointer rounded-xl border-2 p-4 transition-all ${
                            isSelected
                              ? "border-primary-500 ring-2 ring-primary-200"
                              : "border-border hover:border-primary-300"
                          }`}
                        >
                          <div className="absolute top-2 right-2 z-10">
                            <Checkbox
                              checked={isSelected}
                              onChange={() => toggleCounterProduct(product.id)}
                            />
                          </div>
                          <div className="flex flex-col items-center gap-3">
                            <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-surface-alt">
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
                            <div className="text-center w-full">
                              <h3 className="font-medium text-heading text-sm line-clamp-2 mb-1">
                                {product.title}
                              </h3>
                              <p className="text-base font-bold text-primary-500">
                                {getProductEffectivePrice(
                                  product,
                                ).toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}{" "}
                                TL
                              </p>
                            </div>
                          </div>
                        </label>
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
                {t("trade.cashBalanceHint")}
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
                      {t("trade.whoPaysCash")}
                    </p>
                    <div className="flex gap-4">
                      <Radio
                        name="counterCashPayer"
                        value="me"
                        checked={counterCashPayer === "me"}
                        onChange={(e) =>
                          setCounterCashPayer(e.target.value as "me" | "them")
                        }
                        label={t("trade.iWillPay")}
                      />
                      <Radio
                        name="counterCashPayer"
                        value="them"
                        checked={counterCashPayer === "them"}
                        onChange={(e) =>
                          setCounterCashPayer(e.target.value as "me" | "them")
                        }
                        label={t("trade.theyWillPay")}
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
                placeholder={t("trade.counterMessagePlaceholder")}
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
                    {t("common.sending")}
                  </>
                ) : (
                  <>
                    <ArrowsRightLeftIcon className="w-5 h-5" />
                    {t("trade.sendCounterOffer")}
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
