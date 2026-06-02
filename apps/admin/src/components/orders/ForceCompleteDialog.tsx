"use client";

import { useState } from "react";
import {
  Dialog,
  Button,
  Textarea,
  Label,
  FormField,
  Alert,
} from "@tarodan/ui";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

/**
 * Faz 4A.4 — Manuel tamamla dialog'u (super_admin).
 */
export interface ForceCompleteDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason?: string }) => Promise<void>;
  loading?: boolean;
}

export function ForceCompleteDialog({
  open,
  onClose,
  onConfirm,
  loading,
}: ForceCompleteDialogProps) {
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    try {
      await onConfirm({ reason: reason.trim() || undefined });
      setReason("");
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Hata oluştu");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5" />
          Manuel Tamamla
        </h2>

        <Alert variant="destructive">
          Bu eylem siparişi <strong>hemen tamamlar</strong>; satıcıya ödeme
          transferi tetiklenir. <strong>Geri alınamaz</strong>. Yalnızca
          super_admin yetkisi gerektirir.
        </Alert>

        <FormField>
          <Label>Gerekçe (opsiyonel, max 500 karakter)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Neden manuel tamamlandığını yaz..."
          />
        </FormField>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Vazgeç
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Tamamlanıyor..." : "Evet, Tamamla"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
