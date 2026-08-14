/** @format */

"use client";

import { useRef } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import {
  Input,
  Checkbox,
  CardNumberInput,
  ExpiryDateInput,
  CvvInput,
  Tooltip,
  TooltipProvider,
} from "@tarodan/ui";
import { detectBrand } from "./card";
import type { NewCardValues } from "./schema";
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
  const expRef = useRef<HTMLInputElement>(null);
  const cvcRef = useRef<HTMLInputElement>(null);

  const brand = detectBrand(watch("number"));

  return (
    <div className="space-y-4 pt-3">
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

      <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
        <Controller
          control={control}
          name="expiry"
          render={({ field, fieldState }) => (
            <ExpiryDateInput
              ref={expRef}
              label="Son kullanma tarihi"
              value={field.value}
              error={fieldState.error?.message}
              onValueChange={(d) => {
                field.onChange(d);
                if (d.length >= 4) cvcRef.current?.focus();
              }}
            />
          )}
        />
        <div className="w-full">
          <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-body">
            CVV
            <TooltipProvider>
              <Tooltip
                content={
                  <span className="block max-w-[15rem]">
                    <strong className="mb-0.5 block">
                      Güvenlik kodu (CVV)
                    </strong>
                    Kartınızın arka yüzündeki son 3 rakam; Amex için kartınızın
                    ön yüzündeki 4 rakam.
                  </span>
                }
              >
                <span className="inline-flex cursor-help text-primary-500">
                  <InformationCircleIcon className="h-4 w-4" />
                </span>
              </Tooltip>
            </TooltipProvider>
          </span>
          <Controller
            control={control}
            name="cvc"
            render={({ field, fieldState }) => (
              <CvvInput
                ref={cvcRef}
                aria-label="CVV"
                value={field.value}
                error={fieldState.error?.message}
                onValueChange={field.onChange}
              />
            )}
          />
        </div>
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
