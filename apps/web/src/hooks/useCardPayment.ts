/** @format */

"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useZodForm } from "@tarodan/ui/form";
import { CVV_REGEX } from "@tarodan/ui";
import { paymentsApi, membershipApi, type SavedCard } from "@/lib/api";
import { NEW_CARD } from "@/components/payment/card";
import { newCardSchema, emptyNewCard } from "@/components/payment/schema";

export interface PaymentTarget {
  orderId?: string;
  checkoutGroupId?: string;
  tradeId?: string;
}

export interface ResolvedPayment {
  paymentId: string;
  target: PaymentTarget;
}

interface UseCardPaymentArgs {
  cardStorageEnabled: boolean;
  /**
   * Ödenecek kaydı submit ANINDA çözer.
   *
   * Ödeme sayfasında kayıt zaten vardır ve hazır id'ler döner; tek sayfalık
   * checkout'ta ise sipariş + ödeme TAM BURADA oluşturulur. Bu sıralama
   * bilinçlidir: kart alanları önce doğrulanır, sipariş ancak geçerli bir kartla
   * yaratılır — aksi halde her yazım hatası ödemesiz bir sipariş bırakırdı.
   *
   * `null` döndürmek "iptal" demektir (hata mesajı çözücünün sorumluluğunda).
   */
  resolvePayment: () => Promise<ResolvedPayment | null>;
}

/**
 * Card-payment logic: saved-card list, new-card form (zod-validated), and the
 * PayTR Direct submit. PAN/CVV never enters the application API; the browser
 * posts those fields together with the server-signed form directly to PayTR.
 */
export function useCardPayment({
  cardStorageEnabled,
  resolvePayment,
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

    // 1) Kart alanları — sipariş oluşturmadan ÖNCE doğrulanır.
    let cardBody: { saveCard?: boolean; savedCardId?: string };
    let cardFields: Record<string, string> = {};
    if (selected === NEW_CARD) {
      const valid = await form.trigger();
      if (!valid) return; // inline errors
      const v = form.getValues();
      cardBody = { saveCard: cardStorageEnabled && saveCard };
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
      cardBody = { savedCardId: selected };
      if (selectedCard?.requireCvv) cardFields = { cvv: savedCvv };
    }

    setProcessing(true);
    try {
      // 2) Ödenecek kayıt: hazırsa okunur, değilse (checkout) burada oluşur.
      const resolved = await resolvePayment();
      if (!resolved) {
        setProcessing(false);
        return;
      }
      const body: Parameters<typeof paymentsApi.prepareDirectForm>[0] = {
        ...resolved.target,
        paymentId: resolved.paymentId,
        ...cardBody,
      };
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
