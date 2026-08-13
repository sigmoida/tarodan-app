import { z } from "zod";
import { useTranslations } from "next-intl";
import { trPhone } from "@tarodan/ui/form";

type T = ReturnType<typeof useTranslations<never>>;

/** Safe-trade warehouse address as returned by GET /admin/settings/warehouse-address. */
export interface WarehouseAddress {
  id: string;
  title?: string | null;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string | null;
}

const required = (t: T) =>
  z.string().trim().min(1, t("admin.settings.validation.required"));

export const warehouseAddressSchema = (t: T) =>
  z.object({
    title: z.string().trim().optional().or(z.literal("")),
    fullName: required(t),
    // Bu numara Sürat'a gönderici telefonu olarak gidiyor; alıcı tarafıyla aynı
    // kural geçerli, aksi halde kargo katmanı gönderiyi reddediyor.
    phone: trPhone(t("validation.trPhoneOnly")),
    city: required(t),
    district: required(t),
    address: required(t),
    zipCode: z.string().trim().optional().or(z.literal("")),
  });

export type WarehouseAddressFormValues = z.infer<
  ReturnType<typeof warehouseAddressSchema>
>;

/** Server address (or null when unset) → form values (strings). */
export function toWarehouseFormValues(
  address: WarehouseAddress | null,
): WarehouseAddressFormValues {
  return {
    title: address?.title ?? "",
    fullName: address?.fullName ?? "",
    phone: address?.phone ?? "",
    city: address?.city ?? "",
    district: address?.district ?? "",
    address: address?.address ?? "",
    zipCode: address?.zipCode ?? "",
  };
}
