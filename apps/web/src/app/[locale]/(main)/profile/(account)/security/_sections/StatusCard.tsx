"use client";

import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";

export default function StatusCard({ isEnabled }: { isEnabled: boolean }) {
  return (
    <div className="rounded-xl bg-surface-elevated p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${
              isEnabled ? "bg-success-100" : "bg-surface-alt"
            }`}
          >
            <ShieldCheckIcon
              className={`h-6 w-6 ${isEnabled ? "text-success-600" : "text-subtle"}`}
            />
          </div>
          <div className="ml-4">
            <h2 className="text-lg font-semibold text-heading">
              İki Faktörlü Kimlik Doğrulama
            </h2>
            <p className="text-sm text-muted">
              {isEnabled
                ? "Hesabınız 2FA ile korunuyor"
                : "Hesabınızı daha güvenli hale getirin"}
            </p>
          </div>
        </div>
        <Badge variant={isEnabled ? "success" : "secondary"}>
          {isEnabled ? "Aktif" : "Pasif"}
        </Badge>
      </div>
    </div>
  );
}
