"use client";

import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { REQUIREMENTS } from "../_lib/types";

export default function SetupIntro({
  onStart,
  isLoading,
}: {
  onStart: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-elevated p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-medium text-heading">
        2FA'yı Etkinleştir
      </h3>
      <p className="mb-6 text-muted">
        İki faktörlü kimlik doğrulama, hesabınıza giriş yaparken şifrenizin yanı
        sıra telefonunuzdaki bir uygulama tarafından oluşturulan bir kod
        girmenizi gerektirir.
      </p>

      <div className="mb-6 rounded-lg border border-border bg-surface-alt p-4">
        <h4 className="mb-2 font-medium text-primary-900">Gereksinimler:</h4>
        <ul className="space-y-1 text-sm text-primary-800">
          {REQUIREMENTS.map((req) => (
            <li key={req} className="flex items-center">
              <CheckCircleIcon className="mr-2 h-4 w-4 flex-shrink-0" />
              {req}
            </li>
          ))}
        </ul>
      </div>

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={onStart}
        disabled={isLoading}
      >
        {isLoading ? "Yükleniyor..." : "2FA Kurulumunu Başlat"}
      </Button>
    </div>
  );
}
