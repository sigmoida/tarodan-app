/** @format */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { useWatch } from "react-hook-form";
import { useZodForm } from "@tarodan/ui/form";
import { CVV_REGEX } from "@tarodan/ui";
import {
  paymentsApi,
  membershipApi,
  type PaymentPurpose,
  type SavedCard,
} from "@/lib/api";
import { NEW_CARD } from "@/components/payment/card";
import { newCardSchema, emptyNewCard } from "@/components/payment/schema";
import type { InstallmentOptionsView } from "@/components/payment/InstallmentOptions";
import { apiErrorMessage } from "@/hooks/useWebMutation";
import { useInstallmentOptions } from "@/hooks/useInstallmentOptions";
import {
  installmentBinOf,
  installmentSelectionOf,
  installmentSigningErrorOf,
  type InstallmentCardSource,
  type InstallmentGate,
  type InstallmentSigningError,
} from "@/lib/installments";

export interface PaymentTarget {
  orderId?: string;
  checkoutGroupId?: string;
  tradeId?: string;
}

export interface ResolvedPayment {
  paymentId: string;
  target: PaymentTarget;
}

/**
 * Installments on this card form (ADR 0019). The caller decides the gate from
 * the config, the payment kind and the goods total (`installmentGateOf`).
 */
export interface CardPaymentInstallments {
  gate: InstallmentGate;
  /** The minimum goods total, for the `belowMinimum` note. */
  minAmount: number;
  /** The payment to price, when it already exists (payment page). */
  paymentId?: string;
  /** Goods total T the screen shows (priced as `amount` until a payment exists). */
  amount?: number;
}

interface UseCardPaymentArgs {
  /**
   * Cart or membership: saved cards belong to a PayTR store, so only this
   * purpose's cards are listed (the "save card" text follows it too).
   */
  purpose: PaymentPurpose;
  cardStorageEnabled: boolean;
  /**
   * Resolves the record to pay AT submit.
   *
   * On the payment page the record exists and the ids come back at once; on
   * the single-page checkout the order and the payment are created RIGHT
   * HERE. The order is deliberate: the card fields are validated first and
   * the order is created only with a valid card, otherwise every typo would
   * leave an order without a payment.
   *
   * `null` means "cancelled" (the resolver shows its own message).
   */
  resolvePayment: () => Promise<ResolvedPayment | null>;
  /**
   * The distance sales consent of a purchase (checkout / payment page box).
   * Sent with the form request: for an offer order, which has no checkout
   * step, this is the ONLY place the consent reaches the server. Not given
   * for a payment that is not a purchase (membership).
   */
  distanceSalesAccepted?: boolean;
  /** Installment selector; absent = never (membership, boost, trade cash). */
  installments?: CardPaymentInstallments;
  /**
   * `direct-form` answered 409 `server.payment.paymentAmountOutOfDate`: the
   * payment's amount no longer matches its order, cart or trade total. The
   * server message is already shown; the caller starts the payment anew once
   * and reloads or redirects.
   */
  onPaymentOutdated?: (resolved: ResolvedPayment) => void | Promise<void>;
}

const RAW_CARD_FIELD_NAMES = new Set([
  "cc_owner",
  "card_number",
  "expiry_month",
  "expiry_year",
  "cvv",
]);

/**
 * Card-payment logic: saved-card list, new-card form (zod-validated), the
 * installment choice and the PayTR Direct submit. PAN/CVV never enters the
 * application API; the browser posts those fields together with the
 * server-signed form directly to PayTR. The installment options call carries
 * at most the first 8 digits of a new card (`installmentBinOf`).
 */
export function useCardPayment({
  purpose,
  cardStorageEnabled,
  resolvePayment,
  distanceSalesAccepted,
  installments,
  onPaymentOutdated,
}: UseCardPaymentArgs) {
  const t = useTranslations();
  const form = useZodForm(newCardSchema(t), { defaultValues: emptyNewCard });

  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(cardStorageEnabled);
  const [selected, setSelected] = useState<string>(NEW_CARD);
  const [savedCvv, setSavedCvv] = useState("");
  // Checked by default: membership renewal turns on only with a stored card.
  const [saveCard, setSaveCard] = useState(true);
  const [processing, setProcessing] = useState(false);
  /**
   * The payment created at the first submit on checkout: from then on the
   * options are priced for it (the server's T and the buyer's segment), not
   * for the displayed amount.
   */
  const [resolvedPaymentId, setResolvedPaymentId] = useState<string | null>(
    null,
  );

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
        const res = await membershipApi.listCards(purpose);
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
  }, [cardStorageEnabled, purpose]);

  const selectedCard = useMemo(
    () => cards.find((c) => c.id === selected) || null,
    [cards, selected],
  );

  // Installments: priced for the new card's BIN (first 8 digits only) or the
  // saved card. Another card resets the choice to the single payment.
  const gate = installments?.gate ?? "off";
  const cardNumber = useWatch({ control: form.control, name: "number" });
  const newCardBin =
    selected === NEW_CARD ? installmentBinOf(cardNumber ?? "") : null;
  const installmentSource = useMemo<InstallmentCardSource | null>(() => {
    if (selected === NEW_CARD) {
      return newCardBin ? { kind: "bin", bin: newCardBin } : null;
    }
    return selectedCard
      ? { kind: "saved", savedCardId: selectedCard.id }
      : null;
  }, [selected, newCardBin, selectedCard]);
  const options = useInstallmentOptions({
    paymentId: installments?.paymentId ?? resolvedPaymentId,
    amount: installments?.amount,
    source: installmentSource,
    enabled: gate === "on",
  });
  const chosen = gate === "on" ? options.chosen : null;
  const installmentView: InstallmentOptionsView | null =
    gate === "off" || loadingCards
      ? null
      : gate === "belowMinimum"
        ? {
            status: "done",
            offer: {
              kind: "single",
              reason: "below_minimum",
              minAmount: installments?.minAmount,
            },
          }
        : selected === NEW_CARD && !newCardBin
          ? { status: "enterCard" }
          : options.state;
  const installmentPending = gate === "on" && options.pending;
  // The submit closure outlives its render: a refusal acts on the hook as
  // it is now (on checkout the first submit moves the key from the amount
  // to the new payment), not as it was when the buyer clicked.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleSigningError = async (
    error: InstallmentSigningError,
    serverMessage: string | undefined,
    resolved: ResolvedPayment,
  ) => {
    if (error === "amountOutOfDate") {
      toast.error(serverMessage || t("server.payment.paymentAmountOutOfDate"));
      // The pay button stays busy until the payment is started anew: a
      // second click meanwhile would race the reload (or, on checkout,
      // create the order again).
      try {
        await onPaymentOutdated?.(resolved);
      } finally {
        setProcessing(false);
      }
      return;
    }
    setProcessing(false);
    // Total drifted: keep the count, show its new price and let the buyer
    // confirm again. Not offered / unavailable: back to the single payment.
    // All of them read the options again.
    const current = optionsRef.current;
    if (error === "notOffered") current.refuseChosen();
    else if (error === "unavailable") current.resetToSingle();
    void current.refetch();
    const fallback = {
      pricingChanged: t("server.payment.installmentPricingChanged"),
      unavailable: t("server.payment.installmentUnavailable"),
      notOffered: t("server.payment.installmentNotOffered"),
    }[error];
    toast.error(serverMessage || fallback);
  };

  const submit = async () => {
    if (processing || installmentPending) return;

    // 1) Card fields: validated BEFORE any order is created.
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
        toast.error(t("checkout.cvvRequiredForCard"));
        return;
      }
      cardBody = { savedCardId: selected };
      if (selectedCard?.requireCvv) cardFields = { cvv: savedCvv };
    }
    // Single payment sends no `installment` (as before the feature).
    const installment = installmentSelectionOf(chosen, installmentSource);

    setProcessing(true);
    let resolved: ResolvedPayment | null = null;
    try {
      // 2) The record to pay: read when it exists, created here (checkout).
      resolved = await resolvePayment();
      if (!resolved) {
        setProcessing(false);
        return;
      }
      setResolvedPaymentId(resolved.paymentId);
      const body: Parameters<typeof paymentsApi.prepareDirectForm>[0] = {
        ...resolved.target,
        paymentId: resolved.paymentId,
        ...cardBody,
        ...(distanceSalesAccepted !== undefined
          ? { distanceSalesAccepted }
          : {}),
        ...(installment ? { installment } : {}),
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

      for (const { name, value } of data.fields) {
        if (RAW_CARD_FIELD_NAMES.has(name.toLowerCase())) {
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
    } catch (e: unknown) {
      // Installment and amount refusals come before anything is signed:
      // nothing was charged.
      const signingError = installmentSigningErrorOf(e);
      if (signingError && resolved) {
        await handleSigningError(signingError, apiErrorMessage(e), resolved);
        return;
      }
      setProcessing(false);
      toast.error(apiErrorMessage(e) || t("payment.startFailed"));
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
    purpose,
    processing,
    submit,
    installments: {
      /** null: no selector on this form. */
      view: installmentView,
      selectedCount: options.selectedCount,
      select: options.select,
      /** The chosen count above 1 with its server price; null = single. */
      chosen,
      /** A count is chosen and its price is loading: the pay button waits. */
      pending: installmentPending,
    },
  };
}
