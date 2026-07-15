/** @format */

"use client";

import { Input } from "@tarodan/ui";
import {
  FormInput,
  FormTextarea,
  FormCheckbox,
  FormModal,
  useZodForm,
} from "@tarodan/ui/form";
import CityDistrictSelector from "@/components/CityDistrictSelector";
import { addressSchema, type AddressValues } from "../_lib/schemas";
import { useSaveAddress, type Address } from "../_hooks/useAddresses";

const EMPTY: AddressValues = {
  title: "",
  fullName: "",
  phone: "",
  city: "",
  district: "",
  address: "",
  zipCode: "",
  isDefault: false,
};

const displayPhone = (phone: string) =>
  phone
    .replace("+90", "")
    .replace(/\s/g, "")
    .slice(0, 10)
    .replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4")
    .trim();

interface AddressFormModalProps {
  open: boolean;
  onClose: () => void;
  address: Address | null;
}

/** Add/edit address dialog — its own RHF+zod form + save mutation, framed by the
 *  shared `FormModal` (Modal + Form + Cancel/Submit footer). */
export default function AddressFormModal({
  open,
  onClose,
  address,
}: AddressFormModalProps) {
  const save = useSaveAddress();
  const form = useZodForm(addressSchema, { defaultValues: EMPTY });
  const { register, setValue, watch, formState } = form;

  // Custom-driven fields still need to live in the form state.
  register("phone");
  register("city");
  register("district");
  const phone = watch("phone") ?? "";
  const city = watch("city") ?? "";
  const district = watch("district") ?? "";

  const onSubmit = (values: AddressValues) =>
    save.mutate({ id: address?.id ?? null, values }, { onSuccess: onClose });

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={address ? "Adresi Düzenle" : "Yeni Adres"}
      form={form}
      onSubmit={onSubmit}
      isSubmitting={save.isPending}
      resetValues={address ? { ...EMPTY, ...address } : EMPTY}
      submitLabel={address ? "Güncelle" : "Kaydet"}
    >
      <FormInput name="title" label="Adres Başlığı" placeholder="Ev, İş, vb." />

      <div className="grid gap-4 md:grid-cols-2">
        <FormInput name="fullName" label="Ad Soyad" />
        <div>
          <label className="mb-1 block text-sm font-medium text-body">
            Telefon
          </label>
          <div className="flex">
            <span className="inline-flex items-center rounded-l-lg border border-r-0 border-border bg-surface-alt px-3 font-medium text-muted">
              +90
            </span>
            <Input
              type="tel"
              value={displayPhone(phone)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                setValue("phone", "+90" + digits, { shouldValidate: true });
              }}
              placeholder="5XX XXX XX XX"
              className="rounded-l-none"
              error={formState.errors.phone?.message as string | undefined}
            />
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-body">
          İl / İlçe
        </label>
        <CityDistrictSelector
          city={city}
          district={district}
          onCityChange={(c) => {
            setValue("city", c, { shouldValidate: true });
            setValue("district", "", { shouldValidate: true });
          }}
          onDistrictChange={(d) =>
            setValue("district", d, { shouldValidate: true })
          }
          cityPlaceholder="Şehir seçiniz"
          districtPlaceholder="İlçe seçiniz"
        />
        {(formState.errors.city || formState.errors.district) && (
          <p className="mt-1 text-xs text-danger-600">
            {
              (formState.errors.city?.message ||
                formState.errors.district?.message) as string
            }
          </p>
        )}
      </div>

      <FormTextarea name="address" label="Adres" rows={3} />
      <FormInput name="zipCode" label="Posta Kodu (opsiyonel)" />
      <FormCheckbox name="isDefault" label="Varsayılan adres olarak ayarla" />
    </FormModal>
  );
}
