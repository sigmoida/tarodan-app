/** @format */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Select,
  enumLabel,
  subscriptionStatusConfig,
} from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  type UserDetail,
  getMembershipTierOptions,
  getBillingPeriodOptions,
} from "../types";

export function MembershipSection({
  userId,
  membership,
}: {
  userId: string;
  membership: UserDetail["membership"];
}) {
  const t = useTranslations();
  const confirm = useConfirm();
  const [tier, setTier] = useState("");
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");

  const cancel = useAdminMutation(() => adminApi.cancelUserMembership(userId), {
    invalidates: ["users"],
    successMessage: t("admin.users.detail.membershipCancelled"),
  });
  const change = useAdminMutation(
    () => adminApi.changeUserMembership(userId, tier, period),
    {
      invalidates: ["users"],
      successMessage: t("admin.users.detail.membershipUpdated"),
      onSuccess: () => setTier(""),
    },
  );

  const onCancel = async () => {
    await confirm({
      title: t("admin.users.detail.cancelMembership"),
      description: t("admin.users.detail.cancelMembershipConfirm"),
      confirmLabel: t("admin.users.detail.cancelConfirmLabel"),
      destructive: true,
      onConfirm: () => cancel.mutateAsync(),
    });
  };

  return (
    <SectionCard title={t("admin.users.detail.membershipInfoTitle")}>
      {membership ? (
        <DataList>
          <Field label={t("admin.users.detail.membershipTierLabel")}>
            {membership.tier.name}
          </Field>
          <Field label={t("common.status")}>
            {enumLabel(subscriptionStatusConfig, membership.status)}
          </Field>
          {membership.startDate && (
            <Field label={t("admin.users.detail.startDateLabel")}>
              {new Date(membership.startDate).toLocaleDateString("tr-TR")}
            </Field>
          )}
          {membership.endDate && (
            <Field label={t("admin.users.detail.endDateLabel")}>
              {new Date(membership.endDate).toLocaleDateString("tr-TR")}
            </Field>
          )}
        </DataList>
      ) : (
        <p className="text-sm text-muted">
          {t("admin.users.detail.noMembership")}
        </p>
      )}

      <div className="mt-6 space-y-4 border-t border-border pt-6">
        {membership &&
          membership.tier.type !== "free" &&
          (membership.status === "cancelled" ? (
            <Badge variant="warning" size="sm">
              {t("admin.users.detail.membershipCancelledNotice")}
            </Badge>
          ) : (
            <Button
              variant="secondary"
              onClick={onCancel}
              isLoading={cancel.isPending}
              className="border border-danger-300 text-danger-600 hover:bg-danger-50"
            >
              {t("admin.users.detail.cancelMembership")}
            </Button>
          ))}

        <div>
          <p className="mb-2 text-sm text-muted">
            {t("admin.users.detail.changeMembershipLabel")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              placeholder={t("admin.users.detail.tierPlaceholder")}
              options={getMembershipTierOptions(t)}
              className="sm:w-44"
            />
            <Select
              value={period}
              onChange={(e) =>
                setPeriod(e.target.value as "monthly" | "yearly")
              }
              options={getBillingPeriodOptions(t)}
              className="sm:w-36"
            />
            <Button
              variant="primary"
              onClick={() => change.mutate()}
              disabled={!tier}
              isLoading={change.isPending}
            >
              {t("common.apply")}
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
