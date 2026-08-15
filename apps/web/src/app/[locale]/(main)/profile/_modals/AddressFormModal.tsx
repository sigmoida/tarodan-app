/** @format */

"use client";

import {
  FormInput,
  FormPhone,
  FormTextarea,
  FormCheckbox,
  FormModal,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import CityDistrictSelector from "@/components/CityDistrictSelector";
import { useFormModalLabels } from "@/hooks/useFormModalLabels";
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
  const t = useTranslations();
  const save = useSaveAddress();
  const modalLabels = useFormModalLabels();
  const form = useZodForm(addressSchema(t), { defaultValues: EMPTY });
  const { register, setValue, watch, formState } = form;

  // Custom-driven fields still need to live in the form state.
  register("city");
  register("district");
  const city = watch("city") ?? "";
  const district = watch("district") ?? "";

  const onSubmit = (values: AddressValues) =>
    save.mutate({ id: address?.id ?? null, values }, { onSuccess: onClose });

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={address ? t("address.editAddress") : t("address.newAddress")}
      form={form}
      onSubmit={onSubmit}
      isSubmitting={save.isPending}
      resetValues={address ? { ...EMPTY, ...address } : EMPTY}
      submitLabel={address ? t("common.update") : t("common.save")}
      size="lg"
      {...modalLabels}
    >
      <FormInput
        name="title"
        label={t("address.titleLabel")}
        placeholder={t("address.titleLabelPlaceholder")}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <FormInput
          name="fullName"
          label={t("address.fullName")}
          placeholder={t("address.fullNamePlaceholderLong")}
        />
        <FormPhone
          name="phone"
          label={t("address.phone")}
          legacyMessage={t("validation.phoneLegacyNotice")}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-body">
          {t("address.cityDistrict")}
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
          cityPlaceholder={t("common.selectCity")}
          districtPlaceholder={t("common.selectDistrict")}
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

      <FormTextarea
        name="address"
        label={t("address.address")}
        placeholder={t("address.addressPlaceholderLong")}
        rows={3}
      />
      <FormInput
        name="zipCode"
        label={t("address.zipCodeOptional")}
        placeholder={t("address.zipCodePlaceholder")}
      />
      <FormCheckbox name="isDefault" label={t("address.setDefault")} />
    </FormModal>
  );
}
