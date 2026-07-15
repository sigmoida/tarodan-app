"use client";

import { CheckIcon } from "@heroicons/react/24/solid";
import { useTranslations } from "next-intl";

/** The password rules the marketplace enforces, computed from a raw value. */
export function passwordChecks(password: string) {
  return {
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
  };
}

/** True when every rule in `passwordChecks` is satisfied. */
export function isPasswordValid(password: string): boolean {
  const c = passwordChecks(password);
  return c.hasMinLength && c.hasUppercase && c.hasLowercase && c.hasNumber;
}

/** A single requirement row: green + check when met, grey dot otherwise. */
export function PasswordRequirement({
  met,
  text,
}: {
  met: boolean;
  text: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-xs ${met ? "text-success-600" : "text-subtle"}`}
    >
      <div
        className={`w-4 h-4 rounded-full flex items-center justify-center ${
          met ? "bg-success-100" : "bg-surface-alt"
        }`}
      >
        {met ? (
          <CheckIcon className="w-2.5 h-2.5" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-border-strong" />
        )}
      </div>
      <span>{text}</span>
    </div>
  );
}

/** Live 2-col requirements panel, shared by reset-password and register. */
export function PasswordChecklist({ password }: { password: string }) {
  const t = useTranslations();
  const c = passwordChecks(password);
  return (
    <div className="bg-surface rounded-xl p-4 space-y-2">
      <p className="text-xs font-medium text-muted mb-2">
        {t("auth.pwReqTitle")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <PasswordRequirement
          met={c.hasMinLength}
          text={t("auth.pwReqMinLength")}
        />
        <PasswordRequirement
          met={c.hasUppercase}
          text={t("auth.pwReqUppercase")}
        />
        <PasswordRequirement
          met={c.hasLowercase}
          text={t("auth.pwReqLowercase")}
        />
        <PasswordRequirement met={c.hasNumber} text={t("auth.pwReqNumber")} />
      </div>
    </div>
  );
}
