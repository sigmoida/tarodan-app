/** @format */

"use client";

import { Input } from "@tarodan/ui";
import { FormSection } from "./FormSection";
import { useNewListing } from "../_context/NewListingContext";

const fmt = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function PricingSection() {
  const {
    locale,
    formData,
    setFormData,
    commissionPreview,
    commissionPreviewLoading,
  } = useNewListing();

  return (
    <FormSection title="Fiyatlandırma">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1.5">
            Fiyat (₺) <span className="text-danger-500">*</span>
          </label>
          <Input
            type="number"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            className="px-4 py-2.5 border-border rounded text-heading placeholder-subtle"
            placeholder="0.00"
            required
            min={1}
            max={9999999}
            step="0.01"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1.5">
            Stok Miktarı
          </label>
          <Input
            type="number"
            value={
              formData.quantity === "" ||
              formData.quantity === null ||
              formData.quantity === undefined
                ? ""
                : formData.quantity
            }
            onChange={(e) => {
              const value = e.target.value;
              setFormData({
                ...formData,
                quantity: value === "" ? "" : Number(value),
              });
            }}
            className="px-4 py-2.5 border-border rounded text-heading placeholder-subtle"
            placeholder="1"
            min={1}
          />
          <p className="text-xs text-subtle mt-1">
            {locale === "en"
              ? "Defaults to 1 if left empty"
              : "Boş bırakırsanız 1 adet"}
          </p>
        </div>
      </div>

      {(commissionPreviewLoading || commissionPreview) && (
        <div className="mt-4 p-3 bg-surface rounded-lg border border-border-subtle text-sm">
          <p className="text-muted font-medium mb-1">
            {locale === "en" ? "Estimated (per sale)" : "Tahmini (satış başına)"}
          </p>
          {commissionPreviewLoading ? (
            <span className="text-subtle">
              {locale === "en" ? "Calculating..." : "Hesaplanıyor..."}
            </span>
          ) : commissionPreview ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted">
                {locale === "en" ? "Platform deduction" : "Platform kesintisi"}: ₺
                {fmt(commissionPreview.sellerFeeAmount)}
              </span>
              <span className="text-success-700 font-medium">
                {locale === "en" ? "Net to you" : "Net kazanç"}: ₺
                {fmt(commissionPreview.sellerNetAmount)}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </FormSection>
  );
}
