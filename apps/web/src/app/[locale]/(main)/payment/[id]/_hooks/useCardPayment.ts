/** @format */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import toast from "react-hot-toast";
import { useZodForm } from "@tarodan/ui/form";
import { CVV_REGEX } from "@tarodan/ui";
import { paymentsApi, membershipApi, type SavedCard } from "@/lib/api";
import { NEW_CARD } from "../_lib/card";
import { newCardSchema, emptyNewCard } from "../_lib/schema";

interface Target {
  orderId?: string;
  checkoutGroupId?: string;
  tradeId?: string;
}

interface UseCardPaymentArgs {
  target: Target;
  paymentId: string;
  recurringEnabled: boolean;
  onSuccess?: (paymentId: string) => void;
}

/**
 * Card-payment logic: saved-card list, new-card form (zod-validated), and the
 * PayTR Direct submit. Card data is sent only with this request (backend → PayTR)
 * and never stored. The UI stays presentational.
 */
export function useCardPayment({
  target,
  paymentId,
  recurringEnabled,
  onSuccess,
}: UseCardPaymentArgs) {
  const router = useRouter();
  const form = useZodForm(newCardSchema, { defaultValues: emptyNewCard });

  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(recurringEnabled);
  const [selected, setSelected] = useState<string>(NEW_CARD);
  const [savedCvv, setSavedCvv] = useState("");
  const [saveCard, setSaveCard] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!recurringEnabled) {
      setCards([]);
      setSelected(NEW_CARD);
      setLoadingCards(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await membershipApi.listCards();
        if (!alive) return;
        const list = res.data || [];
        setCards(list);
        setSelected(list.length ? list[0].id : NEW_CARD);
      } catch {
        if (alive) setCards([]);
      } finally {
        if (alive) setLoadingCards(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [recurringEnabled]);

  const selectedCard = useMemo(
    () => cards.find((c) => c.id === selected) || null,
    [cards, selected],
  );

  const submit = async () => {
    if (processing) return;

    let body: Parameters<typeof paymentsApi.processDirect>[0];
    if (selected === NEW_CARD) {
      const valid = await form.trigger();
      if (!valid) return; // inline errors
      const v = form.getValues();
      body = {
        ...target,
        paymentId,
        card: {
          cardHolderName: v.holder.trim(),
          cardNumber: v.number,
          expireMonth: v.expiry.slice(0, 2),
          expireYear: v.expiry.slice(2, 4),
          cvc: v.cvc,
        },
        saveCard: recurringEnabled && saveCard,
      };
    } else {
      if (selectedCard?.requireCvv && !CVV_REGEX.test(savedCvv)) {
        toast.error("Bu kart için CVV girin");
        return;
      }
      body = {
        ...target,
        paymentId,
        savedCardId: selected,
        ...(selectedCard?.requireCvv ? { cvv: savedCvv } : {}),
      };
    }

    setProcessing(true);
    try {
      const res = await paymentsApi.processDirect(body);
      const data = res.data;

      // New card + 3D → write the bank's full-page 3D Secure HTML (auto-submits).
      // document.write executes the inline script (dangerouslySetInnerHTML would not).
      if (data.threeDSHtml) {
        const doc = window.document;
        doc.open();
        doc.write(data.threeDSHtml);
        doc.close();
        return;
      }

      if (data.status === "failed") {
        toast.error(data.reason || "Ödeme başarısız oldu");
        setProcessing(false);
        return;
      }

      // success | wait_callback | pending → confirmed on the success page
      if (onSuccess) onSuccess(data.paymentId);
      else router.push(`/payment/success?paymentId=${data.paymentId}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Ödeme başlatılamadı");
      setProcessing(false);
    }
  };

  return {
    form,
    cards,
    loadingCards,
    selected,
    setSelected,
    selectedCard,
    savedCvv,
    setSavedCvv,
    saveCard,
    setSaveCard,
    recurringEnabled,
    processing,
    submit,
  };
}
