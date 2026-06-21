"use client";

/**
 * CardPaymentForm — HİBRİT ödeme: giriş yapmış kullanıcı için PayTR Direct API kart formu.
 *
 * - Kayıtlı kart seçimi (Non3D recurring servisi) veya yeni kart (3D Secure) ile ödeme.
 * - Yeni kartta "kartımı kaydet" → store_card → sonraki ödemeler/oto-yenileme için saklanır.
 * - PAYTR_DIRECT_ENABLED kapalıysa backend 410 döner → onFallbackToIframe() ile iframe'e düşer.
 *
 * GÜVENLİK: Kart no/CVV yalnızca bu istekle backend üzerinden PayTR'a iletilir; hiçbir yerde
 * saklanmaz/loglanmaz. Backend de DB/log'a yazmaz (yalnız PayTR token'ı).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCardIcon, ShieldCheckIcon, ArrowPathIcon, PlusIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { Button, Input, Checkbox } from "@tarodan/ui";
import { paymentsApi, membershipApi, type SavedCard } from "@/lib/api";

type Target = { orderId?: string; checkoutGroupId?: string; tradeId?: string };

interface CardPaymentFormProps {
  /** Ödenecek hedef (biri zorunlu) */
  target: Target;
  /** Bilgi amaçlı tutar (TL) */
  amount?: number;
  /** Başarıda yönlendirme — verilmezse /payment/success?paymentId=... */
  onSuccess?: (paymentId: string) => void;
  /** Backend 410 (Direct kapalı) → çağıran iframe akışına düşmeli */
  onFallbackToIframe?: () => void;
}

const NEW_CARD = "__new__";

export default function CardPaymentForm({ target, amount, onSuccess, onFallbackToIframe }: CardPaymentFormProps) {
  const router = useRouter();
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [selected, setSelected] = useState<string>(NEW_CARD);
  const [processing, setProcessing] = useState(false);
  const [threeDSHtml, setThreeDSHtml] = useState<string | null>(null);

  // Yeni kart alanları
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvc, setCvc] = useState("");
  const [saveCard, setSaveCard] = useState(true);
  // Kayıtlı kart require_cvv ise CVV
  const [savedCvv, setSavedCvv] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await membershipApi.listCards();
        if (!alive) return;
        const list = res.data || [];
        setCards(list);
        // Varsa varsayılan/ilk kartı seç, yoksa yeni kart.
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
  }, []);

  const selectedCard = useMemo(
    () => cards.find((c) => c.id === selected) || null,
    [cards, selected],
  );

  function digitsOnly(v: string) {
    return v.replace(/\D/g, "");
  }

  function validateNewCard(): string | null {
    if (holder.trim().length < 2) return "Kart üzerindeki ismi girin";
    const num = digitsOnly(number);
    if (num.length < 15 || num.length > 16) return "Geçerli bir kart numarası girin";
    if (!/^\d{2}$/.test(expMonth) || Number(expMonth) < 1 || Number(expMonth) > 12)
      return "Son kullanma ayı (AA) geçersiz";
    if (!/^\d{2}(\d{2})?$/.test(expYear)) return "Son kullanma yılı (YY) geçersiz";
    if (!/^\d{3,4}$/.test(cvc)) return "CVV geçersiz";
    return null;
  }

  async function submit() {
    if (processing) return;

    // İstek gövdesini hazırla
    let body: Parameters<typeof paymentsApi.processDirect>[0];
    if (selected === NEW_CARD) {
      const err = validateNewCard();
      if (err) {
        toast.error(err);
        return;
      }
      body = {
        ...target,
        card: {
          cardHolderName: holder.trim(),
          cardNumber: digitsOnly(number),
          expireMonth: expMonth,
          expireYear: expYear,
          cvc,
        },
        saveCard,
      };
    } else {
      if (selectedCard?.requireCvv && !/^\d{3,4}$/.test(savedCvv)) {
        toast.error("Bu kart için CVV girin");
        return;
      }
      body = {
        ...target,
        savedCardId: selected,
        ...(selectedCard?.requireCvv ? { cvv: savedCvv } : {}),
      };
    }

    setProcessing(true);
    try {
      const res = await paymentsApi.processDirect(body);
      const data = res.data;

      // Yeni kart + 3D → bankanın 3DS sayfasını göster (otomatik yönlenir).
      if (data.threeDSHtml) {
        setThreeDSHtml(data.threeDSHtml);
        return;
      }

      // Kayıtlı kart / Non3D sonucu
      if (data.status === "failed") {
        toast.error(data.reason || "Ödeme başarısız oldu");
        setProcessing(false);
        return;
      }

      // success | wait_callback | pending → sonuç success sayfasında doğrulanır
      if (onSuccess) {
        onSuccess(data.paymentId);
      } else {
        router.push(`/payment/success?paymentId=${data.paymentId}`);
      }
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 410 && onFallbackToIframe) {
        // Direct API kapalı → güvenli ödeme sayfasına (iframe) düş.
        onFallbackToIframe();
        return;
      }
      toast.error(e?.response?.data?.message || "Ödeme başlatılamadı");
      setProcessing(false);
    }
  }

  // 3D Secure HTML'i: bankanın doğrulama sayfası (form otomatik submit olur).
  if (threeDSHtml) {
    return (
      <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ShieldCheckIcon className="w-6 h-6 text-primary-500" />
          Güvenli Doğrulama (3D Secure)
        </h2>
        <div dangerouslySetInnerHTML={{ __html: threeDSHtml }} className="payment-iframe-container" />
        <p className="text-sm text-muted mt-4 text-center">
          Bankanızın doğrulama adımını tamamlayın. İşlem sonrası otomatik yönlendirileceksiniz.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <CreditCardIcon className="w-6 h-6 text-primary-500" />
        Kart ile Öde
      </h2>

      {loadingCards ? (
        <div className="flex items-center gap-2 text-muted py-6 justify-center">
          <ArrowPathIcon className="w-5 h-5 animate-spin" /> Kartlar yükleniyor…
        </div>
      ) : (
        <div className="space-y-3">
          {/* Kayıtlı kartlar */}
          {cards.map((c) => (
            <label
              key={c.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                selected === c.id ? "border-primary-500 bg-primary-50" : "border-border hover:border-primary-300"
              }`}
            >
              <input
                type="radio"
                name="savedcard"
                checked={selected === c.id}
                onChange={() => setSelected(c.id)}
                className="accent-primary-500"
              />
              <CreditCardIcon className="w-5 h-5 text-muted" />
              <span className="font-medium text-heading">
                {c.brand || "Kart"} •••• {c.last4}
              </span>
              {c.expMonth && c.expYear && (
                <span className="text-sm text-muted">
                  {c.expMonth}/{c.expYear}
                </span>
              )}
              {selected === c.id && c.requireCvv && (
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="CVV"
                  value={savedCvv}
                  onChange={(e) => setSavedCvv(digitsOnly(e.target.value))}
                  className="ml-auto w-20 rounded-md border border-border px-2 py-1 text-sm"
                  onClick={(e) => e.preventDefault()}
                />
              )}
            </label>
          ))}

          {/* Yeni kart seçeneği */}
          <label
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
              selected === NEW_CARD ? "border-primary-500 bg-primary-50" : "border-border hover:border-primary-300"
            }`}
          >
            <input
              type="radio"
              name="savedcard"
              checked={selected === NEW_CARD}
              onChange={() => setSelected(NEW_CARD)}
              className="accent-primary-500"
            />
            <PlusIcon className="w-5 h-5 text-muted" />
            <span className="font-medium text-heading">Yeni kart ile öde</span>
          </label>

          {/* Yeni kart formu */}
          {selected === NEW_CARD && (
            <div className="space-y-3 pt-2">
              <Input
                placeholder="Kart üzerindeki isim"
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                autoComplete="cc-name"
              />
              <Input
                placeholder="Kart numarası"
                inputMode="numeric"
                value={number}
                onChange={(e) => setNumber(digitsOnly(e.target.value).slice(0, 16))}
                autoComplete="cc-number"
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  placeholder="AA"
                  inputMode="numeric"
                  maxLength={2}
                  value={expMonth}
                  onChange={(e) => setExpMonth(digitsOnly(e.target.value).slice(0, 2))}
                  autoComplete="cc-exp-month"
                />
                <Input
                  placeholder="YY"
                  inputMode="numeric"
                  maxLength={4}
                  value={expYear}
                  onChange={(e) => setExpYear(digitsOnly(e.target.value).slice(0, 4))}
                  autoComplete="cc-exp-year"
                />
                <Input
                  placeholder="CVV"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={cvc}
                  onChange={(e) => setCvc(digitsOnly(e.target.value).slice(0, 4))}
                  autoComplete="cc-csc"
                />
              </div>
              <Checkbox
                label="Kartımı sonraki ödemeler ve otomatik yenileme için kaydet"
                checked={saveCard}
                onChange={(e) => setSaveCard(e.target.checked)}
              />
            </div>
          )}
        </div>
      )}

      <Button onClick={submit} disabled={processing || loadingCards} className="w-full mt-5">
        {processing ? (
          <span className="flex items-center justify-center gap-2">
            <ArrowPathIcon className="w-5 h-5 animate-spin" /> İşleniyor…
          </span>
        ) : (
          <>
            {amount != null
              ? `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL Öde`
              : "Öde"}
          </>
        )}
      </Button>

      <div className="flex items-center gap-2 text-xs text-muted mt-3 justify-center">
        <ShieldCheckIcon className="w-4 h-4 text-success-500" />
        <span>Kart bilgileriniz saklanmaz; PayTR altyapısı ile 256-bit SSL üzerinden işlenir.</span>
      </div>
    </div>
  );
}
