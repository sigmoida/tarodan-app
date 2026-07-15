/** @format */

"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Modal } from "@tarodan/ui";
import { useCounterOffer } from "../_hooks/useOffers";
import type { Offer } from "../_lib/types";

interface CounterOfferModalProps {
  open: boolean;
  onClose: () => void;
  offer: Offer | null;
  /** buyer = counter lower than seller's counter; seller = counter above buyer's offer. */
  mode: "buyer" | "seller";
}

export default function CounterOfferModal({
  open,
  onClose,
  offer,
  mode,
}: CounterOfferModalProps) {
  const counter = useCounterOffer();
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (open) setAmount("");
  }, [open]);

  if (!offer) return null;
  const base = Number(offer.amount);
  const baseLabel = `₺${base.toLocaleString("tr-TR")}`;

  const submit = () => {
    const value = parseFloat(amount.replace(",", "."));
    if (Number.isNaN(value) || value <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
    if (mode === "buyer" && value >= base) {
      toast.error(
        `Satıcının karşı teklifinden (${baseLabel}) düşük olmalıdır.`,
      );
      return;
    }
    if (mode === "seller" && value <= base) {
      toast.error(
        `Karşı teklifiniz alıcının teklifinden (${baseLabel}) yüksek olmalıdır.`,
      );
      return;
    }
    counter.mutate(
      { offerId: offer.id, amount: value, mode },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={mode === "buyer" ? "Daha Düşük Teklif" : "Karşı Teklif Gönder"}
    >
      <p className="mb-4 text-sm text-muted">
        {mode === "buyer" ? "Satıcının karşı teklifi:" : "Alıcının teklifi:"}{" "}
        <strong>{baseLabel}</strong>.{" "}
        {mode === "buyer"
          ? "Bu tutarın altında, ilan fiyatının en az %50 kadarına uygun bir teklif girin."
          : "Bu tutarın üstünde ve ilan fiyatının altında bir tutar girin (sunucu doğrular)."}
      </p>
      <Input
        type="text"
        inputMode="decimal"
        className="mb-4"
        placeholder="Tutar (₺)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="button" onClick={submit} isLoading={counter.isPending}>
          Gönder
        </Button>
      </div>
    </Modal>
  );
}
