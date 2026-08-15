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
      toast.error(t("offer.counterModal.gecerliBirTutarGirin"));
      return;
    }
    if (mode === "buyer" && value >= base) {
      toast.error(
        t(
          "offer.counterModal.saticininKarsiTeklifindenBaseLabelDusukOlmalidir",
          { baseLabel },
        ),
      );
      return;
    }
    if (mode === "seller" && value <= base) {
      toast.error(
        t(
          "offer.counterModal.karsiTeklifinizAlicininTeklifindenBaseLabelYuksek",
          { baseLabel },
        ),
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
      title={
        mode === "buyer"
          ? t("offer.counterModal.dahaDusukTeklif")
          : t("offer.counterModal.karsiTeklifGonder")
      }
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
        {mode === "buyer"
          ? t("offer.counterModal.saticininKarsiTeklifi")
          : t("offer.counterModal.alicininTeklifi")}{" "}
        <strong>{baseLabel}</strong>.{" "}
        {mode === "buyer"
          ? t("offer.counterModal.buTutarinAltindaIlanFiyatininEn")
          : t("offer.counterModal.buTutarinUstundeVeIlanFiyatinin")}
      </p>
      <Input
        type="text"
        inputMode="decimal"
        placeholder={t("offer.counterModal.tutar")}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
    </Modal>
  );
}
