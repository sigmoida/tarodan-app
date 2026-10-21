/** @format */

"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  DevicePhoneMobileIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Skeleton } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import SectionCard from "@/components/ui/SectionCard";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import { useAuthStore } from "@/stores/authStore";
import {
  changePasswordSchema,
  setPasswordSchema,
  type ChangePasswordValues,
  type SetPasswordValues,
} from "../_lib/schemas";
import { PASSWORD_SECTION_ID } from "../_lib/anchors";
import PhoneVerificationModal from "../_modals/PhoneVerificationModal";
import LoadErrorAlert from "../_components/LoadErrorAlert";
import {
  useChangePassword,
  useSetPassword,
  useSignInMethods,
  use2faStatus,
} from "../_hooks/useSecurity";

const EMPTY_CHANGE: ChangePasswordValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const EMPTY_SET: SetPasswordValues = { newPassword: "", confirmPassword: "" };

/** Change the password of an account that has one. */
function ChangePasswordForm() {
  const t = useTranslations();
  const changePassword = useChangePassword();
  const form = useZodForm(changePasswordSchema(t), {
    defaultValues: EMPTY_CHANGE,
  });
  const newPassword = form.watch("newPassword") ?? "";

  const onSubmit = (values: ChangePasswordValues) =>
    changePassword.mutate(values, {
      onSuccess: () => form.reset(EMPTY_CHANGE),
    });

  return (
    <Form form={form} onSubmit={onSubmit} className="space-y-4">
      <FormInput
        name="currentPassword"
        type="password"
        label={t("profile.security.currentPassword")}
        placeholder="••••••••"
        autoComplete="current-password"
      />
      <FormInput
        name="newPassword"
        type="password"
        label={t("auth.newPassword")}
        placeholder="••••••••"
        autoComplete="new-password"
      />
      <PasswordChecklist password={newPassword} />
      <FormInput
        name="confirmPassword"
        type="password"
        label={t("profile.security.newPasswordRepeat")}
        placeholder="••••••••"
        autoComplete="new-password"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" isLoading={changePassword.isPending}>
          {t("profile.security.changePassword")}
        </Button>
      </div>
    </Form>
  );
}

/**
 * Set the first password of an account without one (Google or Apple only).
 * The step-up asks for a fresh provider sign-in; on success the methods
 * answer flips `hasPassword` and the section shows "Change password".
 */
function SetPasswordForm() {
  const t = useTranslations();
  const setPassword = useSetPassword();
  const form = useZodForm(setPasswordSchema(t), { defaultValues: EMPTY_SET });
  const newPassword = form.watch("newPassword") ?? "";

  const onSubmit = (values: SetPasswordValues) =>
    setPassword.mutate(values, { onSuccess: () => form.reset(EMPTY_SET) });

  return (
    <Form form={form} onSubmit={onSubmit} className="space-y-4">
      <div>
        <p className="text-sm font-medium text-heading">
          {t("profile.security.setPasswordTitle")}
        </p>
        <p className="mt-1 text-sm text-muted">
          {t("profile.security.setPasswordIntro")}
        </p>
      </div>
      <FormInput
        name="newPassword"
        type="password"
        label={t("auth.newPassword")}
        placeholder="••••••••"
        autoComplete="new-password"
      />
      <PasswordChecklist password={newPassword} />
      <FormInput
        name="confirmPassword"
        type="password"
        label={t("profile.security.newPasswordRepeat")}
        placeholder="••••••••"
        autoComplete="new-password"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" isLoading={setPassword.isPending}>
          {t("profile.security.setPasswordAction")}
        </Button>
      </div>
    </Form>
  );
}

/** The password block: "Change password", or "Set a password" without one. */
function PasswordBlock({ enabled }: { enabled: boolean }) {
  const { methods, isLoading, isError, refetch } = useSignInMethods(enabled);

  // Cached methods stay on screen when a background refetch fails.
  if (!methods && isError && !isLoading) {
    return <LoadErrorAlert onRetry={() => void refetch()} />;
  }
  if (!methods) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  return methods.hasPassword ? <ChangePasswordForm /> : <SetPasswordForm />;
}

/** Security: the password (change or set), SMS phone verification and 2FA. */
export default function SecuritySection() {
  const t = useTranslations();
  const { user, isAuthenticated } = useAuthStore();
  const { is2faEnabled } = use2faStatus(isAuthenticated);
  const [phoneOpen, setPhoneOpen] = useState(false);

  return (
    <SectionCard title={t("profile.security.title")}>
      <div id={PASSWORD_SECTION_ID} className="scroll-mt-24">
        <PasswordBlock enabled={isAuthenticated} />
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-border-subtle pt-5">
        <div className="flex items-center gap-3">
          <DevicePhoneMobileIcon className="h-5 w-5 text-primary-500" />
          <div>
            <p className="text-sm font-medium text-heading">
              {t("profile.security.phoneVerification")}
            </p>
            <p className="text-xs text-muted">
              {user?.isPhoneVerified
                ? t("profile.security.phoneVerified")
                : t("profile.security.phoneVerifyPrompt")}
            </p>
          </div>
        </div>
        {user?.isPhoneVerified ? (
          <Badge variant="success" size="sm">
            {t("profile.security.phoneVerifiedBadge")}
          </Badge>
        ) : (
          <div className="flex items-center gap-2">
            {user?.phone && (
              <Badge variant="warning" size="sm">
                {t("profile.security.phoneUnverifiedBadge")}
              </Badge>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPhoneOpen(true)}
            >
              {t("profile.verify")}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border-subtle pt-5">
        <div className="flex items-center gap-3">
          <ShieldCheckIcon className="h-5 w-5 text-primary-500" />
          <div>
            <p className="text-sm font-medium text-heading">
              {t("profile.security.twoFactor")}
            </p>
            <p className="text-xs text-muted">
              {is2faEnabled
                ? t("profile.security.twoFactorOn")
                : t("profile.security.twoFactorOff")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {is2faEnabled && (
            <Badge variant="success" size="sm">
              {t("common.active")}
            </Badge>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/profile/security">
              {is2faEnabled
                ? t("profile.security.manage")
                : t("profile.security.setUp")}
            </Link>
          </Button>
        </div>
      </div>

      <PhoneVerificationModal
        open={phoneOpen}
        onClose={() => setPhoneOpen(false)}
      />
    </SectionCard>
  );
}
