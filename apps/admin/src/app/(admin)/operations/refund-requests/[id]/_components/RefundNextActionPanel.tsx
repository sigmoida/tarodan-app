"use client";

import { Alert, Button } from "@tarodan/ui";
import {
  InformationCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import { guidanceForStatus, type GuidanceVariant } from "../_lib/refund-guidance";

const VARIANT_ICON: Record<GuidanceVariant, React.ReactNode> = {
  info: <InformationCircleIcon className="h-6 w-6" />,
  warning: <ExclamationTriangleIcon className="h-6 w-6" />,
  success: <CheckCircleIcon className="h-6 w-6" />,
  danger: <XCircleIcon className="h-6 w-6" />,
  default: <InformationCircleIcon className="h-6 w-6" />,
};

function fmtTry(n: number): string {
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`;
}

export interface RefundNextActionPanelProps {
  status: string;
  reason: string;
  amount: number;
  canForceFinalize: boolean;
  finalizing: boolean;
  onFinalize: () => void;
}

/**
 * "Şimdi ne yapmalısınız?" paneli — her durum için sade durum özeti,
 * işlem gerekip gerekmediği ve (gerekiyorsa) tek birincil aksiyon butonu.
 */
export function RefundNextActionPanel({
  status,
  reason,
  amount,
  canForceFinalize,
  finalizing,
  onFinalize,
}: RefundNextActionPanelProps) {
  const guidance = guidanceForStatus(status);

  return (
    <div className="space-y-4">
      <Alert
        variant={guidance.variant}
        title={guidance.title}
        icon={VARIANT_ICON[guidance.variant]}
      >
        <div className="space-y-3">
          <p>{guidance.description}</p>

          {status === "refunded" && (
            <p className="font-semibold">
              Alıcıya iade edilen tutar: {fmtTry(amount)}
            </p>
          )}

          {canForceFinalize && (
            <Button
              variant="primary"
              onClick={onFinalize}
              isLoading={finalizing}
              disabled={finalizing}
            >
              <BanknotesIcon className="mr-1.5 h-5 w-5" />
              Para İadesini Tamamla
            </Button>
          )}
        </div>
      </Alert>

      {reason === "counterfeit" && (
        <Alert
          variant="danger"
          title="Sahte / taklit ürün şikayeti"
          icon={<ExclamationTriangleIcon className="h-6 w-6" />}
        >
          Bu talep sahte ürün gerekçesiyle açıldı. İade onaylandıktan sonra
          satıcı için yaptırım değerlendirin (uyarı, geçici askı veya fesih) ve
          satıcının diğer ürünleri için risk incelemesi yapın.
        </Alert>
      )}
    </div>
  );
}
