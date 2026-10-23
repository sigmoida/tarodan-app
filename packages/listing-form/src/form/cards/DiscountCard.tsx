import { useState, type ReactNode } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import {
  ChevronRightIcon,
  TagIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ReceiptPercentIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, DatePicker, Input } from "@tarodan/ui";
import { formatTL, isTlAmountRefused, tlAmountValue } from "@tarodan/shared";

/**
 * İlan indirimi — yeni ilan ve düzenleme formlarının ORTAK bölümü.
 *
 * Eskiden yalnız düzenleme ekranındaydı: satıcı ilanı indirimli açamıyor, önce
 * yayınlayıp sonra düzenlemeye girmek zorunda kalıyordu.
 */
export interface SaleData {
  originalPrice: string;
  salePrice: string;
  saleStartDate: string;
  saleEndDate: string;
}

interface DiscountCardProps {
  saleData: SaleData;
  setSaleData: Dispatch<SetStateAction<SaleData>>;
  showDiscountSection: boolean;
  setShowDiscountSection: Dispatch<SetStateAction<boolean>>;
  /** Ürüne uygulanmış kampanyalar — yalnız düzenleme ekranında bilinir. */
  productDiscounts?: any[];
  /**
   * "Tüm indirimleri yönet" bağlantısı. Hedef sayfa uygulamaya göre değişir,
   * bu yüzden kart onu üretmez — verilmezse bölüm hiç çıkmaz.
   */
  manageDiscountsLink?: ReactNode;
  /** The discount section error that blocks the submit (`saleDataError`). */
  salePriceError?: string | null;
}

export default function DiscountCard({
  saleData,
  setSaleData,
  showDiscountSection,
  setShowDiscountSection,
  productDiscounts = [],
  manageDiscountsLink = null,
  salePriceError = null,
}: DiscountCardProps) {
  const t = useTranslations();
  const {
    watch,
    formState: { isSubmitted },
  } = useFormContext();
  // Alt sınır hatası yazarken değil, alandan çıkınca ya da gönderimde görünür.
  const [saleBlurred, setSaleBlurred] = useState(false);
  const price = (watch("price") as string) || "";
  // Text that is not an amount is refused at once on its own field, like the
  // price field; the limit error waits for blur or submit.
  const refusedCopy = t("validation.amountFormatRefused");
  const originalRefused = isTlAmountRefused(saleData.originalPrice);
  const saleRefused = isTlAmountRefused(saleData.salePrice);
  const originalAmount = tlAmountValue(saleData.originalPrice);
  const saleAmount = tlAmountValue(saleData.salePrice);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <Button
        variant="secondary"
        type="button"
        onClick={() => setShowDiscountSection(!showDiscountSection)}
        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-primary-50 to-warning-50 hover:from-primary-100 hover:to-warning-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ReceiptPercentIcon className="w-5 h-5 text-primary-600" />
          <span className="font-medium text-heading">
            {t("product.discountSectionTitle")}
          </span>
          {productDiscounts.length > 0 && (
            <Badge variant="default" size="sm">
              {productDiscounts.length} aktif
            </Badge>
          )}
        </div>
        {showDiscountSection ? (
          <ChevronUpIcon className="w-5 h-5 text-muted" />
        ) : (
          <ChevronDownIcon className="w-5 h-5 text-muted" />
        )}
      </Button>

      {showDiscountSection && (
        <div className="p-4 space-y-4 bg-surface-elevated">
          {/* Quick Sale Price */}
          <div className="p-4 bg-primary-50 rounded-lg border border-primary-100">
            <h4 className="font-medium text-heading mb-3 flex items-center gap-2">
              <TagIcon className="w-4 h-4 text-primary-600" />
              {t("product.quickDiscount")}
            </h4>
            <p className="text-sm text-muted mb-4">
              {t("product.quickDiscountHint")}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-body mb-1">
                  {t("product.originalPriceTry")}
                </label>
                {/* Text, not type="number": see the price field. */}
                <Input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={saleData.originalPrice || price}
                  onChange={(e) =>
                    setSaleData({ ...saleData, originalPrice: e.target.value })
                  }
                  placeholder={price || t("product.originalPrice")}
                  error={originalRefused ? refusedCopy : undefined}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-body mb-1">
                  {t("product.discountedPrice")} (₺)
                </label>
                <Input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={saleData.salePrice}
                  onChange={(e) =>
                    setSaleData({ ...saleData, salePrice: e.target.value })
                  }
                  placeholder={t("product.discountedPricePlaceholder")}
                  onBlur={() => setSaleBlurred(true)}
                  error={
                    saleRefused
                      ? refusedCopy
                      : !originalRefused && (saleBlurred || isSubmitted)
                        ? (salePriceError ?? undefined)
                        : undefined
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-body mb-1">
                  {t("product.discountStart")}
                </label>
                <DatePicker
                  value={saleData.saleStartDate}
                  onChange={(v) =>
                    setSaleData({ ...saleData, saleStartDate: v })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-body mb-1">
                  {t("product.discountEnd")}
                </label>
                <DatePicker
                  value={saleData.saleEndDate}
                  onChange={(v) => setSaleData({ ...saleData, saleEndDate: v })}
                />
              </div>
            </div>

            {saleAmount > 0 && originalAmount > 0 && (
              <div className="flex items-center gap-2 text-sm text-success-700 bg-success-50 p-2 rounded-lg mb-4">
                <span>
                  %{Math.round((1 - saleAmount / originalAmount) * 100)} indirim
                </span>
                <span className="text-muted">
                  ({formatTL(originalAmount)} → {formatTL(saleAmount)})
                </span>
              </div>
            )}

            <p className="text-xs text-muted">
              {t("product.discountComingSoonNote")}
            </p>
          </div>

          {/* Existing Discounts */}
          {productDiscounts.length > 0 && (
            <div>
              <h4 className="font-medium text-heading mb-3">
                {t("product.appliedDiscounts")}
              </h4>
              <div className="space-y-2">
                {productDiscounts.map((discount: any) => (
                  <div
                    key={discount.id}
                    className="flex items-center justify-between p-3 bg-surface rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-heading">
                        {discount.name}
                      </p>
                      <p className="text-sm text-muted">
                        {discount.type === "percentage"
                          ? `%${discount.value}`
                          : `${discount.value} TL`}
                        {discount.code && (
                          <span className="ml-2">Kod: {discount.code}</span>
                        )}
                      </p>
                    </div>
                    <Badge active={discount.isCurrentlyValid} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* İndirim yönetimi sayfasına bağlantı — UYGULAMAYA ait (vitrinde
              `/profile/discounts`, yönetici panelinde karşılığı yok). */}
          {manageDiscountsLink && (
            <div className="pt-2 border-t border-border-subtle">
              {manageDiscountsLink}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
