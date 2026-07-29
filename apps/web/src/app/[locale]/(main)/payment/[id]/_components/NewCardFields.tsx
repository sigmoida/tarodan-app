/** @format */

"use client";

import { useRef, useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import {
  Input,
  Checkbox,
  CardNumberInput,
  ExpiryDateInput,
  CvvInput,
} from "@tarodan/ui";
import { detectBrand } from "../_lib/card";
import type { NewCardValues } from "../_lib/schema";
import CardPreview from "./CardPreview";
import { BrandEmblem } from "./CardVisuals";

interface NewCardFieldsProps {
  form: UseFormReturn<NewCardValues>;
  cardStorageEnabled: boolean;
  saveCard: boolean;
  onSaveCardChange: (v: boolean) => void;
}

export default function NewCardFields({
  form,
  cardStorageEnabled,
  saveCard,
  onSaveCardChange,
}: NewCardFieldsProps) {
  const { control, watch } = form;
  const [cvcFocused, setCvcFocused] = useState(false);
  const expRef = useRef<HTMLInputElement>(null);
  const cvcRef = useRef<HTMLInputElement>(null);

  const number = watch("number");
  const brand = detectBrand(number);

  return (
    <div className="space-y-4 pt-3">
      <CardPreview
        holder={watch("holder")}
        number={number}
        expiry={watch("expiry")}
        cvc={watch("cvc")}
        brand={brand}
        flipped={cvcFocused}
      />

      <Controller
        control={control}
        name="holder"
        render={({ field, fieldState }) => (
          <Input
            label="Kart üzerindeki isim"
            placeholder="Ad Soyad"
            autoComplete="cc-name"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="number"
        render={({ field, fieldState }) => (
          <CardNumberInput
            label="Kart numarası"
            value={field.value}
            error={fieldState.error?.message}
            rightAdornment={
              brand !== "unknown" ? <BrandEmblem brand={brand} /> : undefined
            }
            onValueChange={(d) => {
              field.onChange(d);
              const max = detectBrand(d) === "amex" ? 15 : 16;
              if (d.length >= max) expRef.current?.focus();
            }}
          />
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="expiry"
          render={({ field, fieldState }) => (
            <ExpiryDateInput
              ref={expRef}
              label="Son kullanma (AA/YY)"
              value={field.value}
              error={fieldState.error?.message}
              onValueChange={(d) => {
                field.onChange(d);
                if (d.length >= 4) cvcRef.current?.focus();
              }}
            />
          )}
        />
        <Controller
          control={control}
          name="cvc"
          render={({ field, fieldState }) => (
            <CvvInput
              ref={cvcRef}
              label="CVV"
              value={field.value}
              error={fieldState.error?.message}
              onValueChange={field.onChange}
              onFocus={() => setCvcFocused(true)}
              onBlur={() => setCvcFocused(false)}
            />
          )}
        />
      </div>

      {cardStorageEnabled && (
        <div className="rounded-xl border border-border bg-surface p-3">
          <Checkbox
            label="Kartımı sonraki ödemeler için PayTR'da sakla"
            checked={saveCard}
            onChange={(e) => onSaveCardChange(e.target.checked)}
          />
        </div>
      )}
    </div>
  );
}
