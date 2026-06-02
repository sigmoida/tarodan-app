"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@tarodan/ui";
import { ClockIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

/**
 * Faz 4A.2 — 48h pencere durum kartı.
 * awaiting_buyer_confirmation durumundaki order'ı gösterir.
 */
export interface AwaitingConfirmationCardProps {
  deliveredAt: string | null;
  confirmationDeadline: string | null;
  buyerConfirmedAt: string | null;
  buyerConfirmationType: string | null;
  onExtendClick: () => void;
  onForceCompleteClick: () => void;
}

function formatRemaining(deadlineISO: string): {
  text: string;
  level: "green" | "yellow" | "red" | "expired";
  hoursLeft: number;
} {
  const deadline = new Date(deadlineISO).getTime();
  const now = Date.now();
  const diff = deadline - now;

  if (diff <= 0) {
    return { text: "Süre doldu — cron çalıştığında tamamlanacak", level: "expired", hoursLeft: 0 };
  }

  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const text = `${hours} saat ${minutes} dakika kaldı`;

  let level: "green" | "yellow" | "red" = "green";
  if (hours < 6) level = "red";
  else if (hours < 12) level = "yellow";

  return { text, level, hoursLeft: hours };
}

const levelStyles: Record<string, string> = {
  green: "bg-green-50 border-green-200 text-green-900",
  yellow: "bg-yellow-50 border-yellow-200 text-yellow-900",
  red: "bg-red-50 border-red-200 text-red-900",
  expired: "bg-gray-50 border-gray-300 text-gray-700",
};

export function AwaitingConfirmationCard({
  deliveredAt,
  confirmationDeadline,
  buyerConfirmedAt,
  buyerConfirmationType,
  onExtendClick,
  onForceCompleteClick,
}: AwaitingConfirmationCardProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!confirmationDeadline) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [confirmationDeadline]);

  // Alıcı onayladıysa veya cron tamamladıysa ayrı bilgi göster
  if (buyerConfirmedAt) {
    const typeText =
      buyerConfirmationType === "manual_ok"
        ? "Alıcı erken onayladı"
        : buyerConfirmationType === "auto_timeout"
          ? "48 saat doldu, otomatik tamamlandı"
          : buyerConfirmationType === "admin_force"
            ? "Admin manuel tamamladı"
            : "Tamamlandı";
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-900">
            <CheckCircleIcon className="h-5 w-5" />
            48 Saat Pencere Kapandı
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-green-900">
          {typeText} ·{" "}
          {new Date(buyerConfirmedAt).toLocaleString("tr-TR")}
        </CardContent>
      </Card>
    );
  }

  if (!confirmationDeadline) {
    return null;
  }

  // tick used to trigger re-render every second
  void tick;
  const remaining = formatRemaining(confirmationDeadline);

  return (
    <Card className={`border-2 ${levelStyles[remaining.level]}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClockIcon className="h-5 w-5" />
          48 Saat Alıcı Kontrol Penceresi
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-xs opacity-70">Teslim Tarihi</div>
          <div className="font-medium">
            {deliveredAt
              ? new Date(deliveredAt).toLocaleString("tr-TR")
              : "-"}
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">Son Onay Tarihi</div>
          <div className="font-medium">
            {new Date(confirmationDeadline).toLocaleString("tr-TR")}
          </div>
        </div>
        <div className="text-xl font-bold">{remaining.text}</div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onExtendClick}
            disabled={remaining.level === "expired"}
          >
            Pencereyi Uzat
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onForceCompleteClick}
          >
            Manuel Tamamla
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
