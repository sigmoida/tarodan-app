"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import type { AdminInstallmentPreviewParams } from "@/lib/api/installments";
import { adminKeys } from "@/lib/query/keys";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { INSTALLMENT_PREVIEW_RESOURCE } from "../_lib/resources";

/**
 * The price preview for the typed inputs (a read: GET, keyed on the query).
 * Typing is debounced so each keystroke does not ask the API; the previous
 * table stays on screen while the next one loads. `null` asks nothing.
 * The params are debounced as their JSON text: a new object every render
 * would restart the debounce forever.
 */
export function useInstallmentPreview(
  params: AdminInstallmentPreviewParams | null,
) {
  const text = useDebouncedValue(params ? JSON.stringify(params) : null);
  const debounced = useMemo(
    () => (text ? (JSON.parse(text) as AdminInstallmentPreviewParams) : null),
    [text],
  );
  return useQuery({
    queryKey: adminKeys.preview(INSTALLMENT_PREVIEW_RESOURCE, debounced),
    queryFn: async () => (await adminApi.previewInstallments(debounced!)).data,
    enabled: debounced !== null,
    placeholderData: keepPreviousData,
  });
}
