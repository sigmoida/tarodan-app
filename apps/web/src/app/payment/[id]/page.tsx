"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  CreditCardIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { paymentsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { Button, Checkbox, Input } from "@tarodan/ui";

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const paymentId = params.id as string;
  const isGuestCheckout = searchParams.get("guest") === "true";
  const isMembershipPayment = searchParams.get("type") === "membership";

  const [payment, setPayment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentHtml, setPaymentHtml] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // Kart formu (PayTR Direkt API): kart bizim sayfada girilir, 3D ekranına geçilir
  const [payMode, setPayMode] = useState<"card" | "iframe">("card");
  const [cardForm, setCardForm] = useState({ name: "", number: "", expiry: "", cvv: "" });
  const [saveCard, setSaveCard] = useState(true);
  const [cardSubmitting, setCardSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const urlGuest =
      typeof window !== "undefined" &&
      window.location.search.includes("guest=true");
    const hasToken =
      typeof window !== "undefined" && !!localStorage.getItem("auth_token");
    // Oturum token'ı varken yalnızca isAuthenticated=false ise (ör. ağ hatası) girişe atma;
    // GET /payments/:id/status zaten isteğe bağlı JWT ile çalışır.
    if (!isAuthenticated && !isGuestCheckout && !urlGuest && !hasToken) {
      router.push(`/login?redirect=/payment/${paymentId}`);
      return;
    }

    fetchPayment();
  }, [paymentId, authLoading, isAuthenticated, isGuestCheckout]);

  const fetchPayment = async () => {
    try {
      setIsLoading(true);
      const isGuest =
        isGuestCheckout ||
        (typeof window !== "undefined" &&
          window.location.search.includes("guest=true"));
      const response = isGuest
        ? await paymentsApi.getStatusLightGuest(paymentId)
        : await paymentsApi.getStatusLight(paymentId);
      const paymentData = response.data;

      setPayment(paymentData);

      const isMembership =
        typeof window !== "undefined" &&
        window.location.search.includes("type=membership");
      // Üyelik ödemesi zaten başarılıysa başarı sayfasına gönder (aynı sayfaya döngü olmasın)
      if (isMembership && paymentData.status === "completed") {
        router.replace("/membership/success");
        return;
      }

      // Bypass mode: pending payment without PayTR token — complete instantly
      if (
        paymentData.status === "pending" &&
        !paymentData.paymentHtml &&
        !paymentData.paymentUrl
      ) {
        try {
          const bypassRes = await paymentsApi.bypassComplete(paymentId);
          if (bypassRes.data?.success) {
            toast.success("Ödeme başarılı");
            const hasSession =
              isAuthenticated ||
              (typeof window !== "undefined" &&
                !!localStorage.getItem("auth_token"));
            router.push(
              `/payment/success?paymentId=${paymentId}${!hasSession ? "&guest=true" : ""}`,
            );
            return;
          }
        } catch {
          // Not bypass mode or bypass failed — fall through to normal flow
        }
      }

      // If payment has HTML content (PayTR iframe), set it
      if (paymentData.paymentHtml) {
        setPaymentHtml(paymentData.paymentHtml);
      } else if (paymentData.paymentUrl) {
        const url = paymentData.paymentUrl;
        if (url.includes("/payment/") && url.includes(paymentId)) {
          // Same payment page URL — stay on page
        } else {
          window.location.href = url;
        }
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to fetch payment:", error);
      toast.error("Ödeme bilgisi yüklenemedi");
      // Redirect to home for guests, orders page for authenticated users
      router.push(
        isGuestCheckout
          ? "/"
          : isMembershipPayment
            ? "/profile/membership"
            : "/orders",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\D/g, "").slice(0, 16);
    return v.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\D/g, "").slice(0, 4);
    return v.length >= 3 ? `${v.slice(0, 2)}/${v.slice(2)}` : v;
  };

  /** PayTR Direkt API: kartı bizim formdan al, 3D Secure sayfasına geç */
  const handleDirectPay = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNumber = cardForm.number.replace(/\s/g, "");
    const [mm, yy] = cardForm.expiry.split("/");
    if (!cardForm.name.trim()) return toast.error("Kart üzerindeki ismi girin");
    if (cleanNumber.length < 15 || cleanNumber.length > 16)
      return toast.error("Geçerli bir kart numarası girin");
    if (!mm || !yy || parseInt(mm, 10) < 1 || parseInt(mm, 10) > 12)
      return toast.error("Geçerli bir son kullanma tarihi girin (AA/YY)");
    if (!/^\d{3,4}$/.test(cardForm.cvv)) return toast.error("Geçerli bir CVV girin");

    setCardSubmitting(true);
    try {
      const target = payment.checkoutGroupId
        ? { checkoutGroupId: payment.checkoutGroupId }
        : payment.tradeId
          ? { tradeId: payment.tradeId }
          : { orderId: payment.orderId };
      const direct = await paymentsApi.processDirect({
        ...target,
        card: {
          cardHolderName: cardForm.name.trim(),
          cardNumber: cleanNumber,
          expireMonth: mm,
          expireYear: yy,
          cvc: cardForm.cvv,
        },
        saveCard,
      });
      const data: any = direct.data;
      if (data?.useBypass === true) {
        await paymentsApi.bypassComplete(paymentId).catch(() => {});
        router.push(
          isMembershipPayment
            ? "/membership/success"
            : `/payment/success?paymentId=${paymentId}`,
        );
        return;
      }
      const html: string | undefined = data?.threeDSHtml;
      if (html) {
        // Banka 3D doğrulama sayfası aynı pencerede; doğrulama sonrası PayTR
        // success/fail sayfamıza yönlendirir.
        document.open();
        document.write(html);
        document.close();
        return;
      }
      // non-3D anında çekim
      router.push(
        isMembershipPayment
          ? "/membership/success"
          : payment.tradeId
            ? `/trades/${payment.tradeId}?paid=1`
            : `/payment/success?paymentId=${paymentId}`,
      );
    } catch (error: any) {
      const msg: string =
        error?.response?.data?.message ||
        "Ödeme başlatılamadı. Kart bilgilerinizi kontrol edin.";
      // Direkt API bu mağazada kapalıysa / PayTR reddettiyse iframe akışına
      // otomatik düş: taze token initiate et (oid eşleşmesi için yeniden başlatma şart).
      if (/direkt api|doğrulanamadı|paytr_token/i.test(msg)) {
        try {
          const init = payment.checkoutGroupId
            ? await paymentsApi.initiateGroup(payment.checkoutGroupId, "paytr")
            : payment.tradeId
              ? await paymentsApi.initiateTradeCash(payment.tradeId)
              : await paymentsApi.initiate(payment.orderId, "paytr");
          const initData: any = init.data?.data ?? init.data ?? {};
          if (initData.paymentHtml) {
            setPaymentHtml(initData.paymentHtml);
            setPayMode("iframe");
            toast("Güvenli PayTR ödeme sayfasına yönlendirildiniz.", { icon: "🔒" });
            return;
          }
          if (initData.paymentUrl) {
            window.location.href = initData.paymentUrl;
            return;
          }
        } catch {
          /* iframe fallback da başarısız — orijinal hata gösterilir */
        }
      }
      toast.error(msg);
    } finally {
      setCardSubmitting(false);
    }
  };

  const handlePaymentComplete = () => {
    setIsProcessing(true);
    // Poll for payment status
    const interval = setInterval(async () => {
      try {
        // Use guest endpoint if guest checkout
        const response = isGuestCheckout
          ? await paymentsApi.getStatusLightGuest(paymentId)
          : await paymentsApi.getStatus(paymentId);
        const paymentData = response.data;

        if (paymentData.status === "completed") {
          clearInterval(interval);
          toast.success("Ödeme başarıyla tamamlandı!");
          if (isMembershipPayment) {
            router.push("/membership/success");
          } else if (paymentData.tradeId) {
            // Takas nakit farkı ödemesi → takas sayfasına dön, orders'a gitme
            router.push(`/trades/${paymentData.tradeId}?paid=1`);
          } else {
            router.push(
              `/payment/success?paymentId=${paymentId}${isGuestCheckout ? "&guest=true" : ""}`,
            );
          }
        } else if (paymentData.status === "failed") {
          clearInterval(interval);
          toast.error("Ödeme başarısız oldu");
          router.push(
            `/payment/fail?paymentId=${paymentId}${isGuestCheckout ? "&guest=true" : ""}`,
          );
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development")
          console.error("Failed to check payment status:", error);
      }
    }, 2000);

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(interval);
      setIsProcessing(false);
    }, 300000);
  };

  const urlGuest =
    typeof window !== "undefined" &&
    window.location.search.includes("guest=true");
  if (authLoading && !isGuestCheckout && !urlGuest) {
    return <AuthLoadingScreen />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <ArrowPathIcon className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-muted">Ödeme bilgileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <XCircleIcon className="w-12 h-12 text-danger-500 mx-auto mb-4" />
          <p className="text-muted mb-4">Ödeme bulunamadı</p>
          <Button
            onClick={() =>
              router.push(
                isMembershipPayment ? "/profile/membership" : "/orders",
              )
            }
          >
            {isMembershipPayment ? "Üyelik Sayfasına Dön" : "Siparişlerime Dön"}
          </Button>
        </div>
      </div>
    );
  }

  // If payment is already completed or failed, redirect
  if (payment.status === "completed") {
    if (isMembershipPayment) {
      router.push("/membership/success");
    } else {
      router.push(`/payment/success?paymentId=${paymentId}`);
    }
    return null;
  }

  if (payment.status === "failed") {
    router.push(`/payment/fail?paymentId=${paymentId}`);
    return null;
  }

  return (
    <div className="min-h-screen bg-surface py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-heading mb-2">Ödeme</h1>
          <p className="text-muted">PayTR ile güvenli ödeme</p>
        </div>

        {/* Payment Info Card */}
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted">Ödeme Tutarı</p>
              <p className="text-2xl font-bold text-heading">
                {payment.amount?.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted">Durum</p>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  payment.status === "pending"
                    ? "bg-warning-100 text-warning-800"
                    : payment.status === "completed"
                      ? "bg-success-100 text-success-800"
                      : "bg-danger-100 text-danger-800"
                }`}
              >
                {payment.status === "pending" && "Beklemede"}
                {payment.status === "completed" && "Tamamlandı"}
                {payment.status === "failed" && "Başarısız"}
              </span>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 text-sm text-muted">
              <ShieldCheckIcon className="w-5 h-5 text-success-500" />
              <span>256-bit SSL ile şifrelenmiş güvenli ödeme</span>
            </div>
          </div>
        </div>

        {/* Kart formu (Direkt API) / PayTR iframe / yönlendirme */}
        {payment.status === "pending" &&
        !isGuestCheckout &&
        !urlGuest &&
        (payment.orderId || payment.checkoutGroupId || payment.tradeId) &&
        payMode === "card" ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-elevated rounded-xl shadow-sm p-6"
          >
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CreditCardIcon className="w-6 h-6 text-primary-500" />
              Kart Bilgileri
            </h2>
            <form onSubmit={handleDirectPay} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  Kart Üzerindeki İsim
                </label>
                <Input
                  type="text"
                  value={cardForm.name}
                  onChange={(e) =>
                    setCardForm({ ...cardForm, name: e.target.value.toUpperCase() })
                  }
                  placeholder="AD SOYAD"
                  className="px-4 py-3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  Kart Numarası
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={cardForm.number}
                  onChange={(e) =>
                    setCardForm({ ...cardForm, number: formatCardNumber(e.target.value) })
                  }
                  placeholder="0000 0000 0000 0000"
                  className="px-4 py-3"
                  maxLength={19}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-body mb-2">
                    Son Kullanma Tarihi
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={cardForm.expiry}
                    onChange={(e) =>
                      setCardForm({ ...cardForm, expiry: formatExpiry(e.target.value) })
                    }
                    placeholder="AA/YY"
                    className="px-4 py-3"
                    maxLength={5}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-body mb-2">CVV</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={cardForm.cvv}
                    onChange={(e) =>
                      setCardForm({
                        ...cardForm,
                        cvv: e.target.value.replace(/\D/g, "").slice(0, 4),
                      })
                    }
                    placeholder="000"
                    className="px-4 py-3"
                    maxLength={4}
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer pt-1">
                <Checkbox
                  checked={saveCard}
                  onChange={(e) => setSaveCard(e.target.checked)}
                  className="mt-0.5 h-5 w-5"
                />
                <span className="text-sm text-muted">
                  Kartımı kaydet — sonraki ödemelerde ve otomatik yenilemede kullanılır.
                </span>
              </label>

              <Button
                type="submit"
                disabled={cardSubmitting}
                isLoading={cardSubmitting}
                className="w-full py-4 bg-primary-500 text-inverted text-lg font-semibold rounded-xl hover:bg-primary-600"
              >
                {payment.amount?.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL Öde
              </Button>
            </form>
            <p className="text-xs text-muted mt-3 text-center">
              Ödemeniz 3D Secure ile doğrulanır; banka doğrulama ekranına
              yönlendirileceksiniz.
            </p>
            {(paymentHtml || payment.paymentUrl) && (
              <p className="text-sm text-center mt-2">
                <Button
                  variant="link"
                  type="button"
                  onClick={() => setPayMode("iframe")}
                  className="text-primary-600"
                >
                  PayTR güvenli ödeme sayfasını kullanmak istiyorum
                </Button>
              </p>
            )}
          </motion.div>
        ) : paymentHtml ? (
          // PayTR iframe
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-elevated rounded-xl shadow-sm p-6"
          >
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CreditCardIcon className="w-6 h-6 text-primary-500" />
              Ödeme Formu
            </h2>
            <div
              dangerouslySetInnerHTML={{ __html: paymentHtml }}
              className="payment-iframe-container"
            />
            <p className="text-sm text-muted mt-4 text-center">
              Ödeme tamamlandıktan sonra otomatik olarak yönlendirileceksiniz.
            </p>
            {payment.status === "pending" &&
              !isGuestCheckout &&
              !urlGuest &&
              (payment.orderId || payment.checkoutGroupId || payment.tradeId) && (
                <p className="text-sm text-center mt-2">
                  <Button
                    variant="link"
                    type="button"
                    onClick={() => setPayMode("card")}
                    className="text-primary-600"
                  >
                    Kart bilgilerimi bu sayfada girmek istiyorum
                  </Button>
                </p>
              )}
          </motion.div>
        ) : payment.paymentUrl ? (
          // Generic redirect (fallback)
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-elevated rounded-xl shadow-sm p-8 text-center"
          >
            <CreditCardIcon className="w-16 h-16 text-primary-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              Ödeme Sayfasına Yönlendiriliyorsunuz
            </h2>
            <p className="text-muted mb-6">
              Güvenli ödeme sayfasına yönlendiriliyorsunuz. Lütfen bekleyin...
            </p>
            <Button onClick={() => (window.location.href = payment.paymentUrl)}>
              Ödeme Sayfasına Git
            </Button>
          </motion.div>
        ) : (
          <div className="bg-surface-elevated rounded-xl shadow-sm p-8 text-center">
            <XCircleIcon className="w-16 h-16 text-danger-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              Ödeme Bilgisi Bulunamadı
            </h2>
            <p className="text-muted mb-6">
              Ödeme sayfası bilgisi yüklenemedi. Lütfen tekrar deneyin.
            </p>
            <Button onClick={fetchPayment}>Tekrar Dene</Button>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-6 bg-info-50 border border-info-200 rounded-xl p-4">
          <p className="text-sm text-info-800">
            <strong>Yardıma mı ihtiyacınız var?</strong> Ödeme sırasında sorun
            yaşarsanız, lütfen{" "}
            <a href="/support" className="underline font-medium">
              destek ekibimiz
            </a>{" "}
            ile iletişime geçin.
          </p>
        </div>
      </div>
    </div>
  );
}
