import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { useFormContext } from "react-hook-form";
import {
  TagIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ReceiptPercentIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Input } from "@tarodan/ui";
import type { SaleData } from "../_lib/types";

interface DiscountSectionProps {
  saleData: SaleData;
  setSaleData: Dispatch<SetStateAction<SaleData>>;
  showDiscountSection: boolean;
  setShowDiscountSection: Dispatch<SetStateAction<boolean>>;
  productDiscounts: any[];
}

export default function DiscountSection({
  saleData,
  setSaleData,
  showDiscountSection,
  setShowDiscountSection,
  productDiscounts,
}: DiscountSectionProps) {
  const { watch } = useFormContext();
  const price = (watch("price") as string) || "";
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
          <span className="font-medium text-heading">İndirim & Kampanya</span>
          {productDiscounts.length > 0 && (
            <Badge variant="primary" size="sm">
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
              Hızlı İndirim
            </h4>
            <p className="text-sm text-muted mb-4">
              Ürününüz için hızlıca indirimli fiyat belirleyin. Bu, ürün
              sayfasında üstü çizili fiyat olarak görünecektir.
            </p>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-body mb-1">
                  Orijinal Fiyat (₺)
                </label>
                <Input
                  type="number"
                  value={saleData.originalPrice || price}
                  onChange={(e) =>
                    setSaleData({ ...saleData, originalPrice: e.target.value })
                  }
                  placeholder={price || "Orijinal fiyat"}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-body mb-1">
                  İndirimli Fiyat (₺)
                </label>
                <Input
                  type="number"
                  value={saleData.salePrice}
                  onChange={(e) =>
                    setSaleData({ ...saleData, salePrice: e.target.value })
                  }
                  placeholder="İndirimli fiyat"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-body mb-1">
                  Başlangıç
                </label>
                <Input
                  type="date"
                  value={saleData.saleStartDate}
                  onChange={(e) =>
                    setSaleData({ ...saleData, saleStartDate: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-body mb-1">
                  Bitiş
                </label>
                <Input
                  type="date"
                  value={saleData.saleEndDate}
                  onChange={(e) =>
                    setSaleData({ ...saleData, saleEndDate: e.target.value })
                  }
                />
              </div>
            </div>

            {saleData.salePrice && saleData.originalPrice && (
              <div className="flex items-center gap-2 text-sm text-success-700 bg-success-50 p-2 rounded-lg mb-4">
                <span>
                  %
                  {Math.round(
                    (1 -
                      Number(saleData.salePrice) /
                        Number(saleData.originalPrice)) *
                      100,
                  )}{" "}
                  indirim
                </span>
                <span className="text-muted">
                  ({Number(saleData.originalPrice).toLocaleString("tr-TR")} ₺ →{" "}
                  {Number(saleData.salePrice).toLocaleString("tr-TR")} ₺)
                </span>
              </div>
            )}

            <p className="text-xs text-muted">
              * Not: Bu özellik yakında aktif olacaktır. Şimdilik ürün fiyatını
              doğrudan değiştirebilirsiniz.
            </p>
          </div>

          {/* Existing Discounts */}
          {productDiscounts.length > 0 && (
            <div>
              <h4 className="font-medium text-heading mb-3">
                Bu Ürüne Uygulanan İndirimler
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

          {/* Link to full discount management */}
          <div className="pt-2 border-t border-border-subtle">
            <Link
              href="/profile/discounts"
              className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 text-sm font-medium"
            >
              <ReceiptPercentIcon className="w-4 h-4" />
              Tüm İndirimlerimi Yönet →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
