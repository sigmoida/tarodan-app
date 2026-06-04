"use client";

import { useState } from "react";
import {
  Dialog,
  Button,
  Input,
  Textarea,
  Label,
  FormField,
} from "@tarodan/ui";

/**
 * Faz 4A.3 — 48h penceresini uzatma dialog'u.
 */
export interface ExtendConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { hours: number; reason?: string }) => Promise<void>;
  loading?: boolean;
}

export function ExtendConfirmationDialog({
  open,
  onClose,
  onConfirm,
  loading,
}: ExtendConfirmationDialogProps) {
  const [hours, setHours] = useState<number>(24);
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      setError("Süre 1-168 saat arasında olmalı.");
      return;
    }
    try {
      await onConfirm({
        hours,
        reason: reason.trim() || undefined,
      });
      // Reset + close
      setHours(24);
      setReason("");
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Hata oluştu");
    }
  };

  return (
    <Dialog isOpen={open} onClose={onClose} title="Pencereyi Uzat">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          48 saatlik alıcı kontrol penceresinin son tarihini uzat.
        </p>

        <FormField>
          <Label>Eklenecek saat (1-168, max 7 gün)</Label>
          <Input
            type="number"
            min={1}
            max={168}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </FormField>

        <FormField>
          <Label>Gerekçe (opsiyonel, max 500 karakter)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Neden uzatıldığını yaz..."
          />
        </FormField>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Vazgeç
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Uzatılıyor..." : "Uzat"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
