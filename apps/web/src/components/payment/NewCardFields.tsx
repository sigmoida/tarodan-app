/** @format */

"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations();
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
            label={t("checkout.cardHolder")}
            placeholder={t("checkout.cardHolderPlaceholder")}
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
            label={t("checkout.cardNumber")}
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
              label={t("checkout.expiryDate")}
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
            {t("checkout.cvv")}
            <TooltipProvider>
              <Tooltip
                content={
                  <span className="block max-w-[15rem]">
                    <strong className="mb-0.5 block">
                      {t("checkout.cvvTooltipTitle")}
                    </strong>
                    {t("checkout.cvvTooltipText")}
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
                aria-label={t("checkout.cvv")}
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
            label={t("checkout.saveCardPaytr")}
            checked={saveCard}
            onChange={(e) => onSaveCardChange(e.target.checked)}
          />
        </div>
      )}
    </div>
  );
}
