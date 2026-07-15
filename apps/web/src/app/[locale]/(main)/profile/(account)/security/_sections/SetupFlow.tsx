"use client";

import { useState } from "react";
import Image from "next/image";
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
  const [code, setCode] = useState("");

  const handleVerify = () => {
    if (code.length !== 6) {
      setError("Lütfen 6 haneli kodu girin");
      return;
    }
    verify(code);
  };

  return (
    <div className="rounded-xl bg-surface-elevated p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-medium text-heading">2FA Kurulumu</h3>

      {/* Step 1: Scan QR */}
      <div className="mb-6">
        <div className="mb-3 flex items-center">
          <span className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-sm font-medium text-inverted">
            1
          </span>
          <span className="font-medium text-heading">QR Kodu Tarayın</span>
        </div>
        <p className="mb-4 ml-8 text-sm text-muted">
          Google Authenticator veya benzer bir uygulama ile aşağıdaki QR kodunu
          tarayın.
        </p>
        <div className="mb-4 flex justify-center">
          <div className="rounded-lg border-2 border-border bg-surface-elevated p-4">
            {setupData.qrCodeUrl ? (
              <Image
                src={setupData.qrCodeUrl}
                alt="2FA QR Code"
                width={200}
                height={200}
              />
            ) : (
              <div className="flex h-[200px] w-[200px] items-center justify-center bg-surface-alt text-subtle">
                QR Kod Yüklenemedi
              </div>
            )}
          </div>
        </div>
        <div className="ml-8">
          <p className="mb-2 text-sm text-muted">
            QR kodu tarayamıyorsanız, bu kodu manuel olarak girin:
          </p>
          <div className="flex items-center">
            <code className="flex-1 rounded bg-surface-alt px-3 py-2 font-mono text-sm">
              {setupData.secret}
            </code>
            <Button
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(setupData.secret)}
              className="ml-2"
              title="Kopyala"
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
            Doğrulama Kodunu Girin
          </span>
        </div>
        <p className="mb-4 ml-8 text-sm text-muted">
          Uygulamanızda görünen 6 haneli kodu girin.
        </p>
        <div className="ml-8">
          <Input
            type="text"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
            className="max-w-xs text-center text-2xl tracking-widest"
            maxLength={6}
          />
        </div>
      </div>

      <div className="flex space-x-4">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
          onClick={onCancel}
        >
          İptal
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={handleVerify}
          disabled={isVerifying || code.length !== 6}
        >
          {isVerifying ? "Doğrulanıyor..." : "Doğrula ve Etkinleştir"}
        </Button>
      </div>
    </div>
  );
}
