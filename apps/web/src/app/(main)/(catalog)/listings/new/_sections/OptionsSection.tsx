/** @format */

"use client";

import Link from "next/link";
import { Button, Input, Toggle } from "@tarodan/ui";
import { FormSection } from "./FormSection";
import { useNewListing } from "../_context/NewListingContext";

export default function OptionsSection() {
  const { locale, limits, formData, setFormData } = useNewListing();

  return (
    <FormSection title="Seçenekler">
      <div
        className={`flex items-center justify-between p-3 rounded border ${
          limits?.canTrade
            ? "bg-success-50 border-success-200"
            : "bg-surface border-border"
        }`}
      >
        <div>
          <label className="font-medium text-heading">Takas Aktif</label>
          <p className="text-sm text-muted">
            {limits?.canTrade
              ? locale === "en"
                ? "Also makes this product available for trade"
                : "Bu ürünü takas için de açık tutar"
              : locale === "en"
                ? "Trade feature requires Basic or higher membership"
                : "Takas özelliği Temel veya üstü üyelik gerektirir"}
          </p>
        </div>
        {limits?.canTrade ? (
          <Toggle
            checked={formData.isTradeEnabled}
            onChange={(val) => setFormData({ ...formData, isTradeEnabled: val })}
            size="md"
          />
        ) : (
          <Link
            href="/membership"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Premium'a Geç →
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between p-3 bg-surface rounded border border-border mt-4">
        <div>
          <label className="font-medium text-heading">
            {locale === "en" ? "Set / Bundle" : "Set / Paket"}
          </label>
          <p className="text-sm text-muted">
            {locale === "en"
              ? "Multiple models in one listing (e.g. 5-pack, garage set)"
              : "Tek ilanda birden fazla model (örn. 5'li paket, garaj seti)"}
          </p>
        </div>
        <Toggle
          checked={formData.isSet}
          onChange={(val) => setFormData({ ...formData, isSet: val })}
          size="md"
        />
      </div>

      {formData.isSet && (
        <div className="mt-3 p-3 bg-surface rounded border border-border">
          <label className="block text-sm font-medium text-body mb-1.5">
            {locale === "en" ? "Number of pieces in set" : "Set Parça Sayısı"}
          </label>
          <Input
            type="number"
            min={2}
            value={formData.bundleSize ?? ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                bundleSize: e.target.value
                  ? parseInt(e.target.value, 10)
                  : undefined,
              })
            }
            placeholder={locale === "en" ? "e.g. 5" : "örn. 5"}
          />
          <p className="text-sm text-muted mt-1">
            {locale === "en"
              ? "Total number of pieces. Describe each piece's brand/model/color in the description."
              : "Setteki toplam parça sayısı. Her parçanın marka/model/renk gibi ayrıntılarını açıklamada belirtin."}
          </p>
        </div>
      )}
    </FormSection>
  );
}
