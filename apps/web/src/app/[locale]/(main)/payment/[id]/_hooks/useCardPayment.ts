/** @format */

"use client";

import { useEffect, useMemo, useState } from "react";
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
  cardStorageEnabled: boolean;
}

/**
 * Card-payment logic: saved-card list, new-card form (zod-validated), and the
 * PayTR Direct submit. PAN/CVV never enters the application API; the browser
 * posts those fields together with the server-signed form directly to PayTR.
 */
export function useCardPayment({
  target,
  paymentId,
  cardStorageEnabled,
}: UseCardPaymentArgs) {
  const form = useZodForm(newCardSchema, { defaultValues: emptyNewCard });

  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(cardStorageEnabled);
  const [selected, setSelected] = useState<string>(NEW_CARD);
  const [savedCvv, setSavedCvv] = useState("");
  const [saveCard, setSaveCard] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!cardStorageEnabled) {
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
  }, [cardStorageEnabled]);

  const selectedCard = useMemo(
    () => cards.find((c) => c.id === selected) || null,
    [cards, selected],
  );

  const submit = async () => {
    if (processing) return;

    let body: Parameters<typeof paymentsApi.prepareDirectForm>[0];
    let cardFields: Record<string, string> = {};
    if (selected === NEW_CARD) {
      const valid = await form.trigger();
      if (!valid) return; // inline errors
      const v = form.getValues();
      body = {
        ...target,
        paymentId,
        saveCard: cardStorageEnabled && saveCard,
      };
      cardFields = {
        cc_owner: v.holder.trim(),
        card_number: v.number.replace(/\D/g, ""),
        expiry_month: v.expiry.slice(0, 2),
        expiry_year: v.expiry.slice(2, 4),
        cvv: v.cvc,
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
      };
      if (selectedCard?.requireCvv) cardFields = { cvv: savedCvv };
    }

    setProcessing(true);
    try {
      const res = await paymentsApi.prepareDirectForm(body);
      const data = res.data;
      const action = new URL(data.action);
      if (
        action.protocol !== "https:" ||
        action.hostname !== "www.paytr.com" ||
        action.pathname !== "/odeme"
      ) {
        throw new Error("Unexpected payment target");
      }

      const paytrForm = document.createElement("form");
      paytrForm.method = "POST";
      paytrForm.action = action.toString();
      paytrForm.acceptCharset = "UTF-8";
      paytrForm.style.display = "none";

      const rawCardFieldNames = new Set([
        "cc_owner",
        "card_number",
        "expiry_month",
        "expiry_year",
        "cvv",
      ]);
      for (const { name, value } of data.fields) {
        if (rawCardFieldNames.has(name.toLowerCase())) {
          throw new Error("Unexpected card field in payment payload");
        }
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        paytrForm.appendChild(input);
      }
      for (const [name, value] of Object.entries(cardFields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        paytrForm.appendChild(input);
      }

      document.body.appendChild(paytrForm);
      paytrForm.submit();
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
    cardStorageEnabled,
    processing,
    submit,
  };
}
