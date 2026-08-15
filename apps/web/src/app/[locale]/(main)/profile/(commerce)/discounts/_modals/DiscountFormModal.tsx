/** @format */

"use client";

import { useTranslations } from "next-intl";
import { Button, Checkbox, Input } from "@tarodan/ui";
import {
  FormInput,
  FormDatePicker,
  FormSelect,
  FormTextarea,
  FormCheckbox,
  FormModal,
  useZodForm,
} from "@tarodan/ui/form";
import { getProductEffectivePrice } from "@/lib/productPrice";
import { useFormModalLabels } from "@/hooks/useFormModalLabels";
import { useSaveDiscount } from "../_hooks/useDiscounts";
import {
  emptyDiscountForm,
  type Discount,
  type DiscountFormData,
  type SellerProduct,
} from "../_lib/types";
import { discountSchema } from "../_lib/schema";

interface DiscountFormModalProps {
  open: boolean;
  onClose: () => void;
  editing: Discount | null;
  products: SellerProduct[];
}

function fromDiscount(d: Discount): DiscountFormData {
  return {
    code: d.code || "",
    name: d.name,
    description: d.description || "",
    type: d.type,
    value: d.value,
    buyQuantity: d.buyQuantity?.toString() || "",
    getQuantity: d.getQuantity?.toString() || "",
    minQuantity: d.minQuantity?.toString() || "",
    scope: d.scope === "product" ? "product" : "seller",
    targetProductIds: d.targetProductIds || [],
    minCartValue: d.minCartValue?.toString() || "",
    maxDiscountAmount: d.maxDiscountAmount?.toString() || "",
    usageLimitTotal: d.usageLimitTotal?.toString() || "",
    usageLimitPerUser: d.usageLimitPerUser.toString(),
    isStackable: d.isStackable,
    isActive: d.isActive,
    startDate: d.startDate.split("T")[0],
    endDate: d.endDate.split("T")[0],
  };
}

/** Create/edit discount — its own RHF+zod form + save mutation, framed by the
 *  shared `FormModal`. `value` and `targetProductIds` are custom-controlled. */
export default function DiscountFormModal({
  open,
  onClose,
  editing,
  products,
}: DiscountFormModalProps) {
  const t = useTranslations();
  const save = useSaveDiscount();
  const modalLabels = useFormModalLabels();
  const form = useZodForm(discountSchema(t), {
    defaultValues: emptyDiscountForm(),
  });
  const { register, setValue, watch, formState } = form;

  // Custom-driven fields still need to live in the form state.
  register("value");
  register("targetProductIds");
  const type = watch("type");
  const scope = watch("scope");
  const value = watch("value");
  const targetProductIds = watch("targetProductIds") ?? [];

  const toggleProduct = (id: string) =>
    setValue(
      "targetProductIds",
      targetProductIds.includes(id)
        ? targetProductIds.filter((p) => p !== id)
        : [...targetProductIds, id],
      { shouldValidate: true },
    );

  const onSubmit = (values: DiscountFormData) =>
    save.mutate(
      { id: editing?.id ?? null, form: values },
      { onSuccess: onClose },
    );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        editing
          ? t("seller.discounts.editTitle")
          : t("seller.discounts.createTitle")
      }
      form={form}
      onSubmit={onSubmit}
      isSubmitting={save.isPending}
      resetValues={editing ? fromDiscount(editing) : emptyDiscountForm()}
      submitLabel={editing ? t("common.update") : t("common.create")}
      size="2xl"
      {...modalLabels}
    >
      <FormInput
        name="name"
        label={t("seller.discounts.nameLabel")}
        placeholder={t("seller.discounts.namePlaceholder")}
      />
      <FormTextarea
        name="description"
        label={t("common.description")}
        rows={2}
        placeholder={t("seller.discounts.descriptionPlaceholder")}
      />

      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
        <FormSelect name="type" label={t("seller.discounts.typeLabel")}>
          <option value="percentage">
            {t("seller.discounts.typePercentage")}
          </option>
          <option value="fixed_amount">
            {t("seller.discounts.typeFixed")}
          </option>
          <option value="bogo">{t("seller.discounts.typeBogo")}</option>
          <option value="bulk_quantity">
            {t("seller.discounts.typeBulk")}
          </option>
        </FormSelect>
        {type !== "bogo" && (
          <Input
            label={
              type === "bulk_quantity"
                ? t("seller.discounts.percentLabel")
                : t("seller.discounts.valueLabel")
            }
            type="number"
            min="0"
            max={type === "fixed_amount" ? 10000 : 100}
            step={type === "fixed_amount" ? 0.01 : 1}
            placeholder="10"
            value={value}
            onChange={(e) =>
              setValue("value", parseFloat(e.target.value) || 0, {
                shouldValidate: true,
              })
            }
            error={formState.errors.value?.message as string | undefined}
          />
        )}
      </div>

      {type === "bogo" && (
        <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
          <FormInput
            name="buyQuantity"
            label={t("seller.discounts.buyQuantityLabel")}
            type="number"
            min="1"
            placeholder={t("seller.discounts.buyQuantityPlaceholder")}
          />
          <FormInput
            name="getQuantity"
            label={t("seller.discounts.getQuantityLabel")}
            type="number"
            min="1"
            placeholder={t("seller.discounts.getQuantityPlaceholder")}
          />
        </div>
      )}
      {type === "bulk_quantity" && (
        <FormInput
          name="minQuantity"
          label={t("seller.discounts.minQuantityLabel")}
          type="number"
          min="2"
          placeholder={t("seller.discounts.minQuantityPlaceholder")}
        />
      )}

      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
        <FormSelect name="scope" label={t("seller.discounts.scopeLabel")}>
          <option value="seller">{t("seller.discounts.scopeSeller")}</option>
          <option value="product">{t("seller.discounts.scopeProduct")}</option>
        </FormSelect>
        {type === "bogo" || type === "bulk_quantity" ? (
          <p className="self-end rounded-lg bg-surface p-3 text-xs text-muted">
            {t("seller.discounts.autoCampaignNote")}
          </p>
        ) : (
          <FormInput
            name="code"
            label={t("seller.discounts.codeLabel")}
            placeholder={t("seller.discounts.codePlaceholder")}
          />
        )}
      </div>

      {scope === "product" && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium text-body">
              {t("seller.discounts.selectProducts")}
            </label>
            {products.length > 0 && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() =>
                  setValue(
                    "targetProductIds",
                    targetProductIds.length === products.length
                      ? []
                      : products.map((p) => p.id),
                    { shouldValidate: true },
                  )
                }
              >
                {targetProductIds.length === products.length
                  ? t("seller.discounts.clearSelection")
                  : t("seller.discounts.selectAll")}
              </Button>
            )}
          </div>
          {products.length === 0 ? (
            <p className="rounded-lg bg-surface p-4 text-sm text-muted">
              {t("seller.discounts.noActiveProducts")}
            </p>
          ) : (
            <div className="max-h-48 divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border">
              {products.map((product) => (
                <label
                  key={product.id}
                  className="flex cursor-pointer items-center gap-3 p-3 hover:bg-surface"
                >
                  <Checkbox
                    checked={targetProductIds.includes(product.id)}
                    onChange={() => toggleProduct(product.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-heading">
                      {product.title}
                    </p>
                    <p className="text-xs text-muted">
                      {getProductEffectivePrice(product).toLocaleString(
                        t("common.dateLocale"),
                      )}{" "}
                      TL
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
          {formState.errors.targetProductIds ? (
            <p className="mt-1 text-xs text-danger-600">
              {formState.errors.targetProductIds.message as string}
            </p>
          ) : (
            targetProductIds.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                {t("seller.discounts.selectedCount", {
                  count: targetProductIds.length,
                })}
              </p>
            )
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
        <FormInput
          name="minCartValue"
          label={t("seller.discounts.minCartLabel")}
          type="number"
          min="0"
          step="0.01"
          placeholder={t("seller.discounts.minCartPlaceholder")}
        />
        <FormInput
          name="maxDiscountAmount"
          label={t("seller.discounts.maxDiscountLabel")}
          type="number"
          min="0"
          step="0.01"
          placeholder={t("seller.discounts.maxDiscountPlaceholder")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
        <FormInput
          name="usageLimitTotal"
          label={t("seller.discounts.usageLimitTotalLabel")}
          type="number"
          min="1"
          placeholder={t("seller.discounts.unlimited")}
        />
        <FormInput
          name="usageLimitPerUser"
          label={t("seller.discounts.usageLimitPerUserLabel")}
          type="number"
          min="1"
          placeholder="1"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
        <FormDatePicker
          name="startDate"
          label={t("seller.discounts.startDateLabel")}
        />
        <FormDatePicker
          name="endDate"
          label={t("seller.discounts.endDateLabel")}
        />
      </div>

      <div className="flex items-center gap-6">
        <FormCheckbox
          name="isStackable"
          label={t("seller.discounts.stackable")}
        />
        <FormCheckbox name="isActive" label={t("common.active")} />
      </div>
    </FormModal>
  );
}
