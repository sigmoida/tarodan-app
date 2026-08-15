"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { Button, Input } from "@tarodan/ui";
import type { SetupResponse } from "../_lib/types";

export default function SetupFlow({
  setupData,
  verify,
  isVerifying,
  onCancel,
  setError,
}: {
  setupData: SetupResponse;
  verify: (code: string) => void;
  isVerifying: boolean;
  onCancel: () => void;
  setError: (message: string) => void;
}) {
  const t = useTranslations();
  const [code, setCode] = useState("");

  const handleVerify = () => {
    if (code.length !== 6) {
      setError(t("profile.twoFactor.enterSixDigits"));
      return;
    }
    verify(code);
  };

  return (
    <div className="rounded-xl bg-surface-elevated p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-medium text-heading">
        {t("profile.twoFactor.setupTitle")}
      </h3>

      {/* Step 1: Scan QR */}
      <div className="mb-6">
        <div className="mb-3 flex items-center">
          <span className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-sm font-medium text-inverted">
            1
          </span>
          <span className="font-medium text-heading">
            {t("profile.twoFactor.stepScanQr")}
          </span>
        </div>
        <p className="mb-4 ml-8 text-sm text-muted">
          {t("profile.twoFactor.scanHint")}
        </p>
        <div className="mb-4 flex justify-center">
          <div className="rounded-lg border-2 border-border bg-surface-elevated p-4">
            {/* `qrCodeUrl` bir `otpauth://` bağlantısıdır, görsel adresi değil —
                doğrudan `src` verilince tarayıcı yükleyemez ve kırık görsel çıkar.
                Taranabilir PNG'yi sunucu üretir. */}
            {setupData.qrCodeImage ? (
              <Image
                src={setupData.qrCodeImage}
                alt="2FA QR Code"
                width={200}
                height={200}
                unoptimized
              />
            ) : (
              <div className="flex h-[200px] w-[200px] items-center justify-center bg-surface-alt text-subtle">
                {t("profile.twoFactor.qrLoadFailed")}
              </div>
            )}
          </div>
        </div>
        <div className="ml-8">
          <p className="mb-2 text-sm text-muted">
            {t("profile.twoFactor.manualHint")}
          </p>
          <div className="flex items-center">
            <code className="flex-1 rounded bg-surface-alt px-3 py-2 font-mono text-sm">
              {setupData.secret}
            </code>
            <Button
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(setupData.secret)}
              className="ml-2"
              title={t("common.copy")}
            >
              <ClipboardDocumentIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Step 2: Verify */}
      <div className="mb-6">
        <div className="mb-3 flex items-center">
          <span className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-sm font-medium text-inverted">
            2
          </span>
          <span className="font-medium text-heading">
            {t("profile.twoFactor.stepEnterCode")}
          </span>
        </div>
        <p className="mb-4 ml-8 text-sm text-muted">
          {t("profile.twoFactor.enterCodeHint")}
        </p>
        <div className="ml-8">
          <Input
            type="text"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
            className="max-w-xs text-center text-lg tracking-widest"
            maxLength={6}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={handleVerify}
          disabled={isVerifying || code.length !== 6}
        >
          {isVerifying
            ? t("profile.twoFactor.verifying")
            : t("profile.twoFactor.verifyAndEnable")}
        </Button>
      </div>
    </div>
  );
}
