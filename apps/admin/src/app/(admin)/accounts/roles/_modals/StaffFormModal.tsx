"use client";

import toast from "react-hot-toast";
import type { AxiosResponse } from "axios";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { FormModal, FormInput, FormSelect, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { ROLES, getRoleMeta, type RoleId } from "../_lib/constants";
import { staffSchema, type StaffFormValues } from "../_lib/schema";
import type { StaffItem } from "../_lib/types";

/**
 * Staff assignment / role update modal. Owns its own form (zod) + mutation;
 * the page only holds open/close state. When a new account is created, it reports
 * the temporary password to the parent via `onCreated` (the notice band is shown there).
 */
export function StaffFormModal({
  open,
  onClose,
  editing,
  permissions,
  onCreated,
  onShowMatrix,
}: {
  open: boolean;
  onClose: () => void;
  editing: StaffItem | null;
  permissions: Record<string, string[]>;
  onCreated: (info: { email: string; password: string }) => void;
  onShowMatrix: () => void;
}) {
  const t = useTranslations();
  const roleMeta = getRoleMeta(t);
  const roleOptions = ROLES.map((r) => ({
    value: r,
    label: roleMeta[r].label,
  }));

  const isEdit = Boolean(editing);
  const form = useZodForm(staffSchema(t), {
    defaultValues: {
      email: editing?.email ?? "",
      role: (editing?.role as RoleId) ?? "moderator",
      password: "",
      displayName: "",
    },
  });

  const selectedRole = form.watch("role");

  const save = useAdminMutation(
    // axios 1.19'dan beri AxiosResponse istek gövdesinin tipini de taşıyor;
    // iki farklı uç birleşemeyen bir union üretmesin diye dönüş tipi ortak
    // AxiosResponse'a sabitlenir.
    (v: StaffFormValues): Promise<AxiosResponse> =>
      editing
        ? adminApi.updateStaff(editing.id, { role: v.role })
        : adminApi.assignStaff({
            email: v.email,
            role: v.role,
            ...(v.password ? { password: v.password } : {}),
            ...(v.displayName ? { displayName: v.displayName } : {}),
          }),
    {
      invalidates: ["staff"],
      onSuccess: (res, v) => {
        onClose();
        if (editing) {
          toast.success(t("admin.roles.form.roleUpdated"));
        } else {
          toast.success(t("admin.roles.form.roleAssigned"));
          const tempPassword = (res as { data?: { tempPassword?: string } })
            ?.data?.tempPassword;
          if (tempPassword)
            onCreated({ email: v.email, password: tempPassword });
        }
      },
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.roles.form.editTitle")
          : t("admin.roles.form.createTitle")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("admin.roles.form.assign")}
    >
      <FormInput
        name="email"
        label={t("admin.roles.form.emailLabel")}
        type="email"
        placeholder={t("admin.roles.form.emailPlaceholder")}
        disabled={isEdit}
        helperText={
          isEdit
            ? t("admin.roles.form.emailLockedHelp")
            : t("admin.roles.form.emailAutoCreateHelp")
        }
      />

      {!isEdit && (
        <>
          <FormInput
            name="displayName"
            label={t("admin.roles.form.displayNameLabel")}
            placeholder={t("admin.roles.form.displayNamePlaceholder")}
          />
          <FormInput
            name="password"
            label={t("admin.roles.form.passwordLabel")}
            placeholder={t("admin.roles.form.passwordPlaceholder")}
          />
        </>
      )}

      <FormSelect
        name="role"
        label={t("admin.roles.form.roleLabel")}
        options={roleOptions}
      />

      {selectedRole && (
        <div className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs">
          <p className="font-medium text-heading">
            {roleMeta[selectedRole]?.label}
          </p>
          <p className="mt-0.5 text-muted">
            {roleMeta[selectedRole]?.description}
          </p>
          {selectedRole !== "super_admin" && (
            <p className="mt-1 text-muted">
              {t("admin.roles.form.permissionCountSuffix", {
                count: (permissions[selectedRole] ?? []).length,
              })}{" "}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onClose();
                  onShowMatrix();
                }}
                className="h-auto p-0 text-xs underline"
              >
                {t("admin.roles.form.viewMatrixLink")}
              </Button>
            </p>
          )}
        </div>
      )}
    </FormModal>
  );
}
