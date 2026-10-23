"use client";

import { useTranslations } from "next-intl";
import { Alert, type SelectOption } from "@tarodan/ui";
import {
  FormInput,
  FormModal,
  FormSelect,
  FormTextarea,
  useConfirm,
  useZodForm,
} from "@tarodan/ui/form";
import {
  BOOST_ADMIN_REASON_MAX_LENGTH,
  BOOST_GRANT_MAX_DAYS,
  BOOST_GRANT_MIN_DAYS,
} from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  GRANT_DEFAULT_DAYS,
  grantBoostPayload,
  grantBoostSchema,
  type GrantBoostValues,
} from "../_lib/schema";

/**
 * A free boost for a live listing, named by its id or listing code. No
 * order, payment or invoice (decision D3), so the form says so; the package
 * is optional (none = search priority only). A confirm step precedes the
 * call.
 */
export function GrantBoostModal({
  packages,
  onClose,
}: {
  /** The ad packages (`{ value: id, label: name }`). */
  packages: SelectOption[];
  onClose: () => void;
}) {
  const t = useTranslations();
  const confirm = useConfirm();
  const form = useZodForm(grantBoostSchema(t), {
    defaultValues: {
      productId: "",
      packageId: "",
      durationDays: String(GRANT_DEFAULT_DAYS),
      reason: "",
    },
  });

  const grant = useAdminMutation(
    (v: GrantBoostValues) =>
      adminApi.grantBoost(grantBoostPayload(v)).then((r) => r.data),
    {
      invalidates: ["boost-purchases"],
      successMessage: t("admin.marketing.boostPurchases.grant.done"),
      onSuccess: onClose,
    },
  );

  const submit = async (v: GrantBoostValues) => {
    const confirmed = await confirm({
      title: t("admin.marketing.boostPurchases.grant.action"),
      description: t("admin.marketing.boostPurchases.grant.noInvoiceHint"),
      confirmLabel: t("admin.marketing.boostPurchases.grant.action"),
      cancelLabel: t("common.cancel"),
    });
    if (confirmed) grant.mutate(v);
  };

  return (
    <FormModal
      open
      onClose={onClose}
      title={t("admin.marketing.boostPurchases.grant.action")}
      size="md"
      form={form}
      onSubmit={submit}
      isSubmitting={grant.isPending}
      submitLabel={t("admin.marketing.boostPurchases.grant.action")}
      cancelLabel={t("common.cancel")}
      closeLabel={t("common.close")}
    >
      <Alert variant="info">
        {t("admin.marketing.boostPurchases.grant.noInvoiceHint")}
      </Alert>
      <FormInput
        name="productId"
        label={t("admin.marketing.boostPurchases.grant.listing")}
        autoComplete="off"
      />
      <FormSelect
        name="packageId"
        label={t("admin.marketing.boostPurchases.grant.package")}
        options={[
          {
            value: "",
            label: t("admin.marketing.boostPurchases.grant.noPackage"),
          },
          ...packages,
        ]}
      />
      <FormInput
        name="durationDays"
        type="number"
        inputMode="numeric"
        min={BOOST_GRANT_MIN_DAYS}
        max={BOOST_GRANT_MAX_DAYS}
        step={1}
        label={t("admin.marketing.boostPurchases.grant.days")}
      />
      <FormTextarea
        name="reason"
        rows={3}
        maxLength={BOOST_ADMIN_REASON_MAX_LENGTH}
        label={t("admin.marketing.boostPurchases.grant.reason")}
      />
    </FormModal>
  );
}
