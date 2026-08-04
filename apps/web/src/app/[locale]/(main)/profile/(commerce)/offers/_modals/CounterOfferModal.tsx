/** @format */

"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Input, Modal, ModalFooter } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useCounterOffer } from "../_hooks/useOffers";
import type { Offer } from "../_lib/types";
import { formatTL } from "@/lib/format";

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
  const t = useTranslations();
  const counter = useCounterOffer();
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (open) setAmount("");
  }, [open]);

  if (!offer) return null;
  const base = Number(offer.amount);
  const baseLabel = formatTL(base);

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
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={counter.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("common.send")}
          isLoading={counter.isPending}
          disabled={!amount.trim()}
        />
      }
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
        placeholder="Tutar (₺)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
    </Modal>
  );
}
