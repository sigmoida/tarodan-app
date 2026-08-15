"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Alert, Button, Input } from "@tarodan/ui";

type MutateFn = (code: string, options?: { onSuccess?: () => void }) => void;

export default function EnabledOptions({
  regenerate,
  isRegenerating,
  disable,
  isDisabling,
  setError,
}: {
  regenerate: MutateFn;
  isRegenerating: boolean;
  disable: MutateFn;
  isDisabling: boolean;
  setError: (message: string) => void;
}) {
  const t = useTranslations();
  const [showRegen, setShowRegen] = useState(false);
  const [regenCode, setRegenCode] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  const handleRegenerate = () => {
    if (regenCode.length !== 6) {
      setError(t("profile.twoFactor.enterSixDigits"));
      return;
    }
    regenerate(regenCode, {
      onSuccess: () => {
        setShowRegen(false);
        setRegenCode("");
      },
    });
  };

  const handleDisable = () => {
    if (disableCode.length !== 6) {
      setError(t("profile.twoFactor.enterSixDigits"));
      return;
    }
    disable(disableCode, {
      onSuccess: () => {
        setShowDisable(false);
        setDisableCode("");
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Backup codes */}
      <div className="rounded-xl bg-surface-elevated p-6 shadow-sm">
        <h3 className="mb-2 text-lg font-medium text-heading">
          {t("profile.twoFactor.backupCodesTitle")}
        </h3>
        <p className="mb-4 text-sm text-muted">
          {t("profile.twoFactor.backupCodesIntro")}
        </p>
        {!showRegen ? (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => setShowRegen(true)}
            disabled={isRegenerating}
          >
            {t("profile.twoFactor.regenerate")}
          </Button>
        ) : (
          <div>
            <p className="mb-3 text-sm text-muted">
              {t("profile.twoFactor.regenerateHint")}
            </p>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={regenCode}
              onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, ""))}
              placeholder={t("profile.twoFactor.sixDigitPlaceholder")}
              className="mb-4 text-center tracking-widest"
            />
            <div className="flex space-x-4">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => {
                  setShowRegen(false);
                  setRegenCode("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={handleRegenerate}
                disabled={isRegenerating}
              >
                {isRegenerating ? t("common.loading") : t("common.create")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Disable 2FA */}
      <div className="rounded-xl bg-surface-elevated p-6 shadow-sm">
        <h3 className="mb-2 text-lg font-medium text-heading">
          {t("profile.twoFactor.disableTitle")}
        </h3>
        <p className="mb-4 text-sm text-muted">
          {t("profile.twoFactor.disableIntro")}
        </p>
        {!showDisable ? (
          <Button
            variant="danger"
            size="lg"
            className="w-full"
            onClick={() => setShowDisable(true)}
          >
            {t("profile.twoFactor.disableTitle")}
          </Button>
        ) : (
          <div>
            <Alert
              variant="danger"
              title={t("profile.twoFactor.disableWarningTitle")}
              icon={
                <ExclamationTriangleIcon className="h-5 w-5 text-danger-600" />
              }
              className="mb-4"
            >
              {t("profile.twoFactor.disableWarning")}
            </Alert>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={(e) =>
                setDisableCode(e.target.value.replace(/\D/g, ""))
              }
              placeholder={t("profile.twoFactor.sixDigitPlaceholder")}
              className="mb-4 text-center tracking-widest"
            />
            <div className="flex space-x-4">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => {
                  setShowDisable(false);
                  setDisableCode("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                size="lg"
                className="flex-1"
                onClick={handleDisable}
                disabled={isDisabling}
              >
                {isDisabling
                  ? t("checkout.processing")
                  : t("profile.twoFactor.disableAction")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
