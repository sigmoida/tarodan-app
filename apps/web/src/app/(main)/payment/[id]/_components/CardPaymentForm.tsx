"use client";

/**
 * CardPaymentForm — TEK ödeme yüzeyi: PayTR Direct API kart formu (misafir + üye).
 *
 * - Yeni kart (3D Secure) ile ödeme; tüm akışlarda (sipariş/sepet/takas/üyelik) aynı bileşen.
 * - recurringEnabled (PayTR Non3D yetkisi) açıkken: kayıtlı kart seçimi (Non3D) + "kartımı kaydet".
 *   Kapalıyken kayıtlı kart UI'ı ve kaydetme gizlenir (yalnız yeni-kart 3D).
 *
 * GÜVENLİK: Kart no/CVV yalnızca bu istekle backend üzerinden PayTR'a iletilir; hiçbir yerde
 * saklanmaz/loglanmaz. Backend de DB/log'a yazmaz (yalnız PayTR token'ı).
 *
 * NOT: Bu dosyada yalnız SUNUM (UI) zenginleştirildi — ödeme mantığı (state, validation,
 * submit, PayTR akışı) birebir korundu.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCardIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  PlusIcon,
  LockClosedIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { Button, Checkbox } from "@tarodan/ui";
import { paymentsApi, membershipApi, type SavedCard } from "@/lib/api";

type Target = { orderId?: string; checkoutGroupId?: string; tradeId?: string };

interface CardPaymentFormProps {
  /** Ödenecek hedef (biri zorunlu) */
  target: Target;
  /** Bilgi amaçlı tutar (TL) */
  amount?: number;
  /** Başarıda yönlendirme — verilmezse /payment/success?paymentId=... */
  onSuccess?: (paymentId: string) => void;
  /** Kayıtlı kart + "kartımı kaydet" gösterilsin mi (PayTR Non3D yetkisi açık + üye). */
  recurringEnabled?: boolean;
}

const NEW_CARD = "__new__";

/* ───────────────────────── kart yardımcıları (sadece sunum) ───────────────────────── */

type CardBrand = "visa" | "mastercard" | "amex" | "troy" | "unknown";

function detectBrand(num: string): CardBrand {
  const n = num.replace(/\D/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|22[2-9]|2[3-6]|27[01]|2720)/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^9792/.test(n)) return "troy";
  return "unknown";
}

/** Kayıtlı kartın metinsel markasını rozet markasına eşle (sunum). */
function brandFromLabel(label?: string | null): CardBrand {
  const s = (label || "").toLowerCase();
  if (s.includes("visa")) return "visa";
  if (s.includes("master")) return "mastercard";
  if (s.includes("amex") || s.includes("express")) return "amex";
  if (s.includes("troy")) return "troy";
  return "unknown";
}

function formatCardNumber(num: string, brand: CardBrand): string {
  const n = num.replace(/\D/g, "");
  // Amex: 4-6-5
  if (brand === "amex") {
    return [n.slice(0, 4), n.slice(4, 10), n.slice(10, 15)].filter(Boolean).join(" ");
  }
  return (n.match(/.{1,4}/g) || []).join(" ");
}

const BRAND_LABEL: Record<CardBrand, string> = {
  visa: "VISA",
  mastercard: "Mastercard",
  amex: "AMEX",
  troy: "TROY",
  unknown: "",
};

/** Önizleme kartının markaya göre arka plan degradesi (sunum). */
const BRAND_GRADIENT: Record<CardBrand, string> = {
  visa: "from-[#1a1f71] via-[#243b8f] to-[#0b1b54]",
  mastercard: "from-[#2b2b2f] via-[#3a2b25] to-[#101013]",
  amex: "from-[#2e77bc] via-[#1f5e9e] to-[#103a6b]",
  troy: "from-[#0090b8] via-[#00748f] to-[#00485a]",
  unknown: "from-slate-700 via-slate-800 to-slate-900",
};

/** Kart marka rozeti (saf CSS, dış logo bağımlılığı yok). */
function BrandBadge({ brand, className = "" }: { brand: CardBrand; className?: string }) {
  if (brand === "unknown") return null;
  const styles: Record<Exclude<CardBrand, "unknown">, string> = {
    visa: "bg-white text-[#1a1f71]",
    mastercard: "bg-white text-[#eb001b]",
    amex: "bg-white text-[#2e77bc]",
    troy: "bg-white text-[#00a0d2]",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide shadow-sm ${styles[brand]} ${className}`}
    >
      {BRAND_LABEL[brand]}
    </span>
  );
}

/** Mastercard'ın iç içe iki halkası — markaya özel logo hissi (sunum). */
function MastercardMark() {
  return (
    <span className="relative inline-flex h-6 w-10 items-center">
      <span className="absolute left-0 h-6 w-6 rounded-full bg-[#eb001b]" />
      <span className="absolute left-4 h-6 w-6 rounded-full bg-[#f79e1b] mix-blend-screen" />
    </span>
  );
}

/** EMV çip — gerçekçi altın detay (sunum). */
function CardChip() {
  return (
    <div className="relative h-7 w-10 rounded-md bg-gradient-to-br from-yellow-200 via-amber-300 to-yellow-500 shadow-inner ring-1 ring-yellow-600/30">
      <div className="absolute inset-1 grid grid-cols-3 gap-px opacity-50">
        <span className="border border-yellow-700/40" />
        <span className="border border-yellow-700/40" />
        <span className="border border-yellow-700/40" />
        <span className="border border-yellow-700/40" />
        <span className="border border-yellow-700/40" />
        <span className="border border-yellow-700/40" />
      </div>
    </div>
  );
}

/** Temassız ödeme dalgaları (sunum). */
function ContactlessIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M8.5 7.5a6 6 0 0 1 0 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11.5 5.5a9.5 9.5 0 0 1 0 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.5 3.5a13 13 0 0 1 0 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ───────────────────────────── etiketli alan ───────────────────────────── */

function Field({
  label,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-heading placeholder:text-muted/60 " +
  "focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition";

/** Alan geçerliyse yeşil tik (sunum — canlı doğrulama geri bildirimi). */
function ValidTick({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <CheckCircleIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-success-500" />
  );
}

export default function CardPaymentForm({ target, amount, onSuccess, recurringEnabled = false }: CardPaymentFormProps) {
  const router = useRouter();
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(recurringEnabled);
  const [selected, setSelected] = useState<string>(NEW_CARD);
  const [processing, setProcessing] = useState(false);

  // Yeni kart alanları
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvc, setCvc] = useState("");
  const [saveCard, setSaveCard] = useState(true);
  // Kayıtlı kart require_cvv ise CVV
  const [savedCvv, setSavedCvv] = useState("");

  // Sunum: CVV'ye odaklanınca kartı arkaya çevir; otomatik odak geçişi için ref'ler.
  const [cvcFocused, setCvcFocused] = useState(false);
  const expRef = useRef<HTMLInputElement>(null);
  const cvcRef = useRef<HTMLInputElement>(null);

  const brand = useMemo(() => detectBrand(number), [number]);

  useEffect(() => {
    // Kayıtlı kart listesi yalnız Non3D yetkisi açıkken (kayıtlı kartla ödeme mümkünken) alınır.
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
  }, [recurringEnabled]);

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

  // Sunum: canlı alan geçerlilikleri (yalnız yeşil tik/odak geçişi için; submit mantığı validateNewCard).
  const numDigits = digitsOnly(number);
  const holderValid = holder.trim().length >= 2;
  const numberValid = numDigits.length >= 15 && numDigits.length <= 16;
  const expValid =
    /^\d{2}$/.test(expMonth) && Number(expMonth) >= 1 && Number(expMonth) <= 12 && /^\d{2}(\d{2})?$/.test(expYear);
  const cvcValid = /^\d{3,4}$/.test(cvc);

  // Sunum: "AA / YY" tek alanı → expMonth + expYear state'lerine yazar (mantık aynı).
  const expCombined = expMonth + (expMonth.length === 2 || expYear ? "/" : "") + (expYear ? expYear.slice(-2) : "");
  function onExpChange(raw: string) {
    const d = digitsOnly(raw).slice(0, 4);
    setExpMonth(d.slice(0, 2));
    setExpYear(d.slice(2, 4));
    if (d.length >= 4) cvcRef.current?.focus();
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
        saveCard: recurringEnabled && saveCard,
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

      // Yeni kart + 3D → bankanın 3D Secure sayfasını TAM SAYFA aç (profesyonel akış;
      // sayfaya gömmüyoruz). PayTR'nin döndürdüğü HTML otomatik submit eder → banka 3D
      // sayfası (tam sayfa) → sonuç merchant_ok_url/fail_url (/payment/success | /payment/fail)
      // ile geri döner. Not: dangerouslySetInnerHTML <script> ÇALIŞTIRMAZ; document.write
      // çalıştırır — auto-submit'in işlemesi için tam-sayfa yazım şart.
      if (data.threeDSHtml) {
        const doc = window.document;
        doc.open();
        doc.write(data.threeDSHtml);
        doc.close();
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
      toast.error(e?.response?.data?.message || "Ödeme başlatılamadı");
      setProcessing(false);
    }
  }

  const amountLabel =
    amount != null
      ? `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
      : null;

  return (
    <div className="bg-surface-elevated rounded-2xl shadow-sm ring-1 ring-border/60 overflow-hidden">
      {/* Başlık */}
      <div className="flex items-center gap-2.5 px-6 pt-6">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 ring-1 ring-primary-100">
          <CreditCardIcon className="w-5 h-5 text-primary-600" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-heading leading-tight">Kart ile Öde</h2>
          <p className="text-xs text-muted">PayTR güvenli ödeme altyapısı</p>
        </div>
        <div className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700 ring-1 ring-success-200/70">
          <LockClosedIcon className="w-3.5 h-3.5" />
          Güvenli
        </div>
      </div>

      <div className="p-6">
        {loadingCards ? (
          <div className="flex items-center gap-2 text-muted py-8 justify-center">
            <ArrowPathIcon className="w-5 h-5 animate-spin" /> Kartlar yükleniyor…
          </div>
        ) : (
          <div className="space-y-3">
            {/* Kayıtlı kartlar */}
            {cards.map((c) => {
              const cBrand = brandFromLabel(c.brand);
              const active = selected === c.id;
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                    active
                      ? "border-primary-500 bg-primary-50 ring-1 ring-primary-200"
                      : "border-border hover:border-primary-300 hover:bg-surface"
                  }`}
                >
                  <input
                    type="radio"
                    name="savedcard"
                    checked={active}
                    onChange={() => setSelected(c.id)}
                    className="accent-primary-500 w-4 h-4"
                  />
                  <span className="inline-flex h-8 w-12 items-center justify-center rounded-md bg-gradient-to-br from-slate-700 to-slate-900 text-white">
                    {cBrand === "mastercard" ? (
                      <MastercardMark />
                    ) : cBrand !== "unknown" ? (
                      <BrandBadge brand={cBrand} />
                    ) : (
                      <CreditCardIcon className="w-4 h-4" />
                    )}
                  </span>
                  <span className="font-medium text-heading tracking-wide tabular-nums">
                    •••• {c.last4}
                  </span>
                  {c.expMonth && c.expYear && (
                    <span className="text-sm text-muted tabular-nums">
                      {c.expMonth}/{c.expYear}
                    </span>
                  )}
                  {active && c.requireCvv && (
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="CVV"
                      value={savedCvv}
                      onChange={(e) => setSavedCvv(digitsOnly(e.target.value))}
                      className="ml-auto w-20 rounded-lg border border-border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
                      onClick={(e) => e.preventDefault()}
                    />
                  )}
                  {active && !c.requireCvv && (
                    <CheckCircleIcon className="ml-auto w-5 h-5 text-primary-500" />
                  )}
                </label>
              );
            })}

            {/* Yeni kart seçeneği */}
            <label
              className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                selected === NEW_CARD
                  ? "border-primary-500 bg-primary-50 ring-1 ring-primary-200"
                  : "border-border hover:border-primary-300 hover:bg-surface"
              }`}
            >
              <input
                type="radio"
                name="savedcard"
                checked={selected === NEW_CARD}
                onChange={() => setSelected(NEW_CARD)}
                className="accent-primary-500 w-4 h-4"
              />
              <span className="inline-flex h-8 w-12 items-center justify-center rounded-md border border-dashed border-border text-muted">
                <PlusIcon className="w-5 h-5" />
              </span>
              <span className="font-medium text-heading">Yeni kart ile öde</span>
            </label>

            {/* Yeni kart formu */}
            {selected === NEW_CARD && (
              <div className="pt-3 space-y-4">
                {/* Canlı kart önizlemesi — CVV'ye odaklanınca arkaya döner (flip) */}
                <div
                  className="relative w-full aspect-[1.586/1] max-w-sm mx-auto sm:mx-0"
                  style={{ perspective: "1000px" }}
                >
                  <div
                    className="relative h-full w-full transition-transform duration-500"
                    style={{
                      transformStyle: "preserve-3d",
                      transform: cvcFocused ? "rotateY(180deg)" : "rotateY(0deg)",
                    }}
                  >
                    {/* ÖN YÜZ */}
                    <div
                      className={`absolute inset-0 rounded-2xl p-5 text-white shadow-lg overflow-hidden bg-gradient-to-br ${BRAND_GRADIENT[brand]}`}
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
                      <div className="absolute -left-6 -bottom-10 w-28 h-28 rounded-full bg-white/5" />
                      <div className="flex items-start justify-between">
                        <CardChip />
                        <div className="flex items-center gap-2">
                          <ContactlessIcon className="h-5 w-5 text-white/70" />
                          {brand === "mastercard" ? <MastercardMark /> : <BrandBadge brand={brand} />}
                        </div>
                      </div>
                      <div className="mt-5 font-mono text-lg sm:text-xl tracking-[0.15em] tabular-nums drop-shadow-sm">
                        {formatCardNumber(number, brand) || "•••• •••• •••• ••••"}
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[9px] uppercase tracking-widest text-white/60">Kart Sahibi</div>
                          <div className="truncate text-sm font-medium uppercase">{holder || "AD SOYAD"}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] uppercase tracking-widest text-white/60">Son Kul.</div>
                          <div className="text-sm font-medium tabular-nums">
                            {(expMonth || "AA") + "/" + (expYear ? expYear.slice(-2) : "YY")}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ARKA YÜZ */}
                    <div
                      className={`absolute inset-0 rounded-2xl text-white shadow-lg overflow-hidden bg-gradient-to-br ${BRAND_GRADIENT[brand]}`}
                      style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                    >
                      <div className="mt-5 h-10 w-full bg-black/70" />
                      <div className="px-5 mt-4">
                        <div className="text-[9px] uppercase tracking-widest text-white/60 mb-1 text-right">CVV</div>
                        <div className="flex h-9 items-center justify-end rounded bg-white/90 px-3 font-mono text-sm tracking-widest text-slate-900">
                          {cvc ? "•".repeat(cvc.length) : "•••"}
                        </div>
                        <p className="mt-3 text-[10px] leading-snug text-white/55">
                          Kartınızın arkasındaki son 3 haneli güvenlik kodu.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Alanlar */}
                <Field label="Kart üzerindeki isim" htmlFor="cc-holder">
                  <div className="relative">
                    <input
                      id="cc-holder"
                      className={`${inputCls} pr-10`}
                      placeholder="Ad Soyad"
                      value={holder}
                      onChange={(e) => setHolder(e.target.value)}
                      autoComplete="cc-name"
                    />
                    <ValidTick show={holderValid} />
                  </div>
                </Field>

                <Field label="Kart numarası" htmlFor="cc-number">
                  <div className="relative">
                    <input
                      id="cc-number"
                      className={`${inputCls} pr-16 font-mono tracking-wider tabular-nums`}
                      placeholder="0000 0000 0000 0000"
                      inputMode="numeric"
                      value={formatCardNumber(number, brand)}
                      onChange={(e) => {
                        const d = digitsOnly(e.target.value).slice(0, 16);
                        setNumber(d);
                        const max = detectBrand(d) === "amex" ? 15 : 16;
                        if (d.length >= max) expRef.current?.focus();
                      }}
                      autoComplete="cc-number"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {brand === "unknown" ? (
                        <CreditCardIcon className="w-5 h-5 text-muted/50" />
                      ) : brand === "mastercard" ? (
                        <MastercardMark />
                      ) : (
                        <BrandBadge brand={brand} />
                      )}
                    </div>
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Son kullanma (AA/YY)" htmlFor="cc-exp">
                    <div className="relative">
                      <input
                        id="cc-exp"
                        ref={expRef}
                        className={`${inputCls} pr-10 tabular-nums`}
                        placeholder="AA / YY"
                        inputMode="numeric"
                        maxLength={5}
                        value={expCombined}
                        onChange={(e) => onExpChange(e.target.value)}
                        autoComplete="cc-exp"
                      />
                      <ValidTick show={expValid} />
                    </div>
                  </Field>
                  <Field label="CVV" htmlFor="cc-cvv">
                    <div className="relative">
                      <input
                        id="cc-cvv"
                        ref={cvcRef}
                        className={`${inputCls} pr-10 tabular-nums`}
                        placeholder="•••"
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={cvc}
                        onChange={(e) => setCvc(digitsOnly(e.target.value).slice(0, 4))}
                        onFocus={() => setCvcFocused(true)}
                        onBlur={() => setCvcFocused(false)}
                        autoComplete="cc-csc"
                      />
                      <ValidTick show={cvcValid} />
                    </div>
                  </Field>
                </div>

                {recurringEnabled && (
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <Checkbox
                      label="Kartımı sonraki ödemeler ve otomatik yenileme için kaydet"
                      checked={saveCard}
                      onChange={(e) => setSaveCard(e.target.checked)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <Button onClick={submit} disabled={processing || loadingCards} className="w-full mt-6 h-12 text-base">
          {processing ? (
            <span className="flex items-center justify-center gap-2">
              <ArrowPathIcon className="w-5 h-5 animate-spin" /> İşleniyor…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <LockClosedIcon className="w-5 h-5" />
              {amountLabel ? `${amountLabel} Güvenli Öde` : "Güvenli Öde"}
            </span>
          )}
        </Button>

        {/* Güven rozetleri */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheckIcon className="w-4 h-4 text-success-500" /> 256-bit SSL
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircleIcon className="w-4 h-4 text-success-500" /> PayTR güvencesi
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LockClosedIcon className="w-4 h-4 text-success-500" /> Kart bilgileri saklanmaz
          </span>
        </div>
      </div>
    </div>
  );
}
