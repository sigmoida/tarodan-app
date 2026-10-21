"use client";

import { useTranslations } from "next-intl";
import {
  FormModal,
  FormTextarea,
  useConfirm,
  useZodForm,
} from "@tarodan/ui/form";
import { BOOST_ADMIN_REASON_MAX_LENGTH } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { revokeBoostSchema, type RevokeBoostValues } from "../../_lib/schema";

/** Stop a free grant early (no money moves), after a reason and a confirm. */
export function RevokeGrantModal({
  purchaseId,
  onClose,
}: {
  purchaseId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const confirm = useConfirm();
  const form = useZodForm(revokeBoostSchema(t), {
    defaultValues: { reason: "" },
  });

  const revoke = useAdminMutation(
    (v: RevokeBoostValues) =>
      adminApi
        .revokeBoostGrant(purchaseId, { reason: v.reason.trim() })
        .then((response) => response.data),
    {
      invalidates: ["boost-purchases"],
      successMessage: t("admin.marketing.boostPurchases.revoke.done"),
      onSuccess: onClose,
    },
  );

  const submit = async (v: RevokeBoostValues) => {
    const confirmed = await confirm({
      title: t("admin.marketing.boostPurchases.revoke.action"),
      description: t("admin.marketing.boostPurchases.revoke.confirm"),
      confirmLabel: t("admin.marketing.boostPurchases.revoke.action"),
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (confirmed) revoke.mutate(v);
  };

  return (
    <FormModal
      open
      onClose={onClose}
      title={t("admin.marketing.boostPurchases.revoke.action")}
      size="md"
      form={form}
      onSubmit={submit}
      isSubmitting={revoke.isPending}
      submitLabel={t("admin.marketing.boostPurchases.revoke.action")}
      cancelLabel={t("common.cancel")}
      closeLabel={t("common.close")}
      destructive
    >
      <p className="text-sm text-muted">
        {t("admin.marketing.boostPurchases.revoke.confirm")}
      </p>
      <FormTextarea
        name="reason"
        rows={3}
        maxLength={BOOST_ADMIN_REASON_MAX_LENGTH}
        label={t("admin.marketing.boostPurchases.refund.reason")}
      />
    </FormModal>
  );
}
