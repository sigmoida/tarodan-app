"use client";

import {
  FormModal,
  FormInput,
  FormCheckbox,
  FormSelect,
  useZodForm,
} from "@tarodan/ui/form";
import { Button, Checkbox, Input } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { adminKeys } from "@/lib/query/keys";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  packageSchema,
  packageToForm,
  packageFormToPayload,
  type PackageFormValues,
  type AdPackage,
  type AudienceUser,
  type MembershipTierType,
} from "../_lib/types";
import { TierRowsEditor } from "../_components/TierRowsEditor";

/** Create/edit an ad package. Mount with `key={pkg?.id ?? 'new'}` for fresh defaults. */
export function PackageFormModal({
  open,
  onClose,
  pkg,
}: {
  open: boolean;
  onClose: () => void;
  pkg?: AdPackage;
}) {
  const t = useTranslations();
  const isEdit = Boolean(pkg);
  const form = useZodForm(packageSchema(t), {
    defaultValues: packageToForm(pkg),
  });
  const audienceMode = form.watch("audienceMode");
  const selectedTierTypes = form.watch("targetTierTypes");
  const selectedUserIds = form.watch("targetUserIds");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<AudienceUser[]>(
    pkg?.targetUsers ?? [],
  );

  const { data: userResults = [], isFetching: isSearchingUsers } = useQuery({
    queryKey: adminKeys.preview("ad-package-user-search", userSearch.trim()),
    enabled: userSearch.trim().length >= 2,
    queryFn: async () => {
      const response = await adminApi.getUsers({
        page: 1,
        limit: 10,
        search: userSearch.trim(),
      });
      const rows = response.data?.data ?? response.data?.users ?? [];
      return rows.map((user: any): AudienceUser => ({
        id: user.id,
        adminCode: user.adminCode,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
      }));
    },
  });

  const usesTiers =
    audienceMode === "membership_tiers" || audienceMode === "tiers_or_users";
  const usesUsers =
    audienceMode === "specific_users" || audienceMode === "tiers_or_users";

  const toggleTier = (tier: MembershipTierType) => {
    const next = selectedTierTypes.includes(tier)
      ? selectedTierTypes.filter((item) => item !== tier)
      : [...selectedTierTypes, tier];
    form.setValue("targetTierTypes", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const addUser = (user: AudienceUser) => {
    if (selectedUserIds.includes(user.id)) return;
    form.setValue("targetUserIds", [...selectedUserIds, user.id], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setSelectedUsers((current) => [...current, user]);
    setUserSearch("");
  };

  const removeUser = (userId: string) => {
    form.setValue(
      "targetUserIds",
      selectedUserIds.filter((id) => id !== userId),
      { shouldDirty: true, shouldValidate: true },
    );
    setSelectedUsers((current) => current.filter((user) => user.id !== userId));
  };

  const save = useAdminMutation(
    (v: PackageFormValues) =>
      isEdit
        ? adminApi.patch(
            `/admin/ad-packages/${pkg!.id}`,
            packageFormToPayload(v),
          )
        : adminApi.post("/admin/ad-packages", packageFormToPayload(v)),
    {
      invalidates: ["ad-packages"],
      successMessage: isEdit
        ? t("admin.marketing.adPackages.updated")
        : t("admin.marketing.adPackages.created"),
      errorMessage: t("admin.marketing.adPackages.saveFailed"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.marketing.adPackages.edit")
          : t("admin.marketing.adPackages.new")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
      size="2xl"
      closeOnBackdrop={false}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormInput
          name="name"
          label={t("admin.marketing.adPackages.name")}
          placeholder={t("admin.marketing.adPackages.namePlaceholder")}
        />
        <FormInput
          name="slug"
          label={t("admin.marketing.adPackages.slug")}
          placeholder={t("admin.marketing.adPackages.slugPlaceholder")}
          helperText={t("admin.marketing.adPackages.slugHelper")}
        />
        <FormInput
          name="sortOrder"
          type="number"
          min="0"
          label={t("admin.marketing.adPackages.sortOrder")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface-alt/40 p-3">
        <FormCheckbox
          name="showcaseOnHome"
          label={t("admin.marketing.adPackages.showcaseOnHomeLabel")}
        />
        <FormCheckbox name="isActive" label={t("common.active")} />
        <p className="basis-full text-xs text-muted">
          {t("admin.marketing.adPackages.showcaseOnHomeHelper")}
        </p>
      </div>

      <section className="space-y-4 rounded-lg border border-border bg-surface-alt/30 p-4">
        <div>
          <h3 className="text-sm font-semibold text-heading">
            {t("admin.marketing.adPackages.audience")}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {t("admin.marketing.adPackages.audienceHelper")}
          </p>
        </div>

        <FormSelect
          name="audienceMode"
          label={t("admin.marketing.adPackages.audienceMode")}
          options={[
            {
              value: "everyone",
              label: t("admin.marketing.adPackages.audienceEveryone"),
            },
            {
              value: "membership_tiers",
              label: t("admin.marketing.adPackages.audienceTiers"),
            },
            {
              value: "specific_users",
              label: t("admin.marketing.adPackages.audienceUsers"),
            },
            {
              value: "tiers_or_users",
              label: t("admin.marketing.adPackages.audienceTiersOrUsers"),
            },
          ]}
        />

        {usesTiers && (
          <div>
            <p className="mb-2 text-sm font-medium text-body">
              {t("admin.marketing.adPackages.membershipTiers")}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["free", t("admin.marketing.adPackages.tierFree")],
                  ["basic", t("admin.marketing.adPackages.tierBasic")],
                  ["premium", t("admin.marketing.adPackages.tierPremium")],
                  ["business", t("admin.marketing.adPackages.tierBusiness")],
                ] as const
              ).map(([value, label]) => (
                <div
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-body"
                >
                  <Checkbox
                    checked={selectedTierTypes.includes(value)}
                    onChange={() => toggleTier(value)}
                    label={label}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {usesUsers && (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="package-user-search"
                className="mb-1.5 block text-sm font-medium text-body"
              >
                {t("admin.marketing.adPackages.specificUsers")}
              </label>
              <div className="relative">
                <Input
                  id="package-user-search"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder={t(
                    "admin.marketing.adPackages.userSearchPlaceholder",
                  )}
                  leftAdornment={
                    <MagnifyingGlassIcon className="h-5 w-5 text-muted" />
                  }
                />
              </div>
            </div>

            {userSearch.trim().length >= 2 && (
              <div className="max-h-52 overflow-y-auto rounded-md border border-border bg-surface">
                {isSearchingUsers ? (
                  <p className="px-3 py-3 text-sm text-muted">
                    {t("common.loading")}
                  </p>
                ) : userResults.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted">
                    {t("admin.marketing.adPackages.noUsersFound")}
                  </p>
                ) : (
                  userResults.map((user) => (
                    <Button
                      key={user.id}
                      type="button"
                      variant="ghost"
                      onClick={() => addUser(user)}
                      disabled={selectedUserIds.includes(user.id)}
                      className="h-auto w-full justify-between gap-3 rounded-none border-b border-border/60 px-3 py-2 text-left last:border-0 disabled:cursor-default disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-heading">
                          {user.displayName}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {user.adminCode} · @{user.username} · {user.email}
                        </span>
                      </span>
                      <span className="text-xs font-medium text-primary">
                        {selectedUserIds.includes(user.id)
                          ? t("common.selected")
                          : t("common.select")}
                      </span>
                    </Button>
                  ))
                )}
              </div>
            )}

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((user) => (
                  <span
                    key={user.id}
                    className="inline-flex max-w-full items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-primary"
                  >
                    <span className="truncate">
                      {user.adminCode} · @{user.username}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("common.remove")}
                      onClick={() => removeUser(user.id)}
                      className="h-5 w-5 p-0"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </Button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="border-t border-border pt-4">
        <TierRowsEditor />
      </div>
    </FormModal>
  );
}
