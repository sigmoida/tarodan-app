"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ShieldCheckIcon,
  ArrowPathIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { paymentsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import CardPaymentForm from "@/components/CardPaymentForm";
import { Button } from "@tarodan/ui";

/**
 * Ödeme sayfası — TEK ödeme yüzeyi (iframe kaldırıldı). Misafir + üye aynı kart formunu kullanır.
 * Akış: ödeme durumunu yükle → tamamlandıysa/başarısızsa yönlendir → bekliyorsa CardPaymentForm
 * (PayTR Direct API). Yeni kart 3D Secure HTML'i form içinde render edilir; sonuç success sayfasında
 * verify ile kesinleşir. PAYMENT_BYPASS (dev) açıksa kart formu yerine ödeme anında tamamlanır.
 */
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
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Ödemeden vazgeç: bekleyen siparişi iptal et → REZERVE EDİLEN STOK ANINDA
  // serbest kalır (yoksa 30 dk cron'a kadar "stok bitti" görünüyordu). Cancel ucu
  // auth gerektirdiğinden misafirde çağrılmaz; misafir rezervi 30 dk cron bırakır.
  const handleCancel = async () => {
    setCancelling(true);
    const hasSession =
      isAuthenticated ||
      (typeof window !== "undefined" &&
        localStorage.getItem("tarodan_authed") === "1");
    try {
      if (hasSession) {
        await paymentsApi.cancel(paymentId);
        toast.success("Ödeme iptal edildi, ürün tekrar satışa açıldı.");
      }
    } catch {
      // sessiz: yine de geri dön
    } finally {
      router.push(isGuestCheckout ? "/" : "/cart");
    }
  };
  // fetchPayment mount başına TEK kez (StrictMode çift-effect + auth hidrasyonu koruması).
  const startedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    const urlGuest =
      typeof window !== "undefined" &&
      window.location.search.includes("guest=true");
    const hasToken =
      typeof window !== "undefined" &&
      localStorage.getItem("tarodan_authed") === "1";
    // Misafir değilse ve oturum yoksa girişe yönlendir (status endpoint'i opsiyonel JWT ile çalışır).
    if (!isAuthenticated && !isGuestCheckout && !urlGuest && !hasToken) {
      router.push(`/login?redirect=/payment/${paymentId}`);
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;
    fetchPayment();
  }, [paymentId, authLoading, isAuthenticated, isGuestCheckout]);

  const fetchPayment = async () => {
    try {
      setIsLoading(true);
      const isGuest =
        isGuestCheckout ||
        (typeof window !== "undefined" &&
          window.location.search.includes("guest=true"));

      // Public ödeme yapılandırması (bypass + kayıtlı kart/oto-yenileme).
      let cfg = { bypassEnabled: false, recurringEnabled: false };
      try {
        cfg = (await paymentsApi.getConfig()).data;
      } catch {
        /* config alınamazsa güvenli varsayılan: yalnız yeni-kart, bypass kapalı */
      }
      // Kayıtlı kart yalnız giriş yapmış kullanıcıya gösterilir (misafirin kartı olmaz).
      setRecurringEnabled(cfg.recurringEnabled && !isGuest);

      const response = isGuest
        ? await paymentsApi.getStatusLightGuest(paymentId)
        : await paymentsApi.getStatusLight(paymentId);
      const paymentData = response.data;
      setPayment(paymentData);

      const isMembership =
        typeof window !== "undefined" &&
        window.location.search.includes("type=membership");
      // Üyelik değişim türü (kind) success sayfasına taşınsın (mesaj için).
      const kindParam = searchParams.get("kind");
      const membershipSuccessUrl = kindParam
        ? `/membership/success?kind=${kindParam}`
        : "/membership/success";
      // Üyelik ödemesi zaten başarılıysa başarı sayfasına gönder (döngü olmasın).
      if (isMembership && paymentData.status === "completed") {
        router.replace(membershipSuccessUrl);
        return;
      }

      // PAYMENT_BYPASS (dev/test): kart formu anlamsız — ödemeyi anında tamamla.
      if (cfg.bypassEnabled && paymentData.status === "pending") {
        try {
          const bypassRes = await paymentsApi.bypassComplete(paymentId);
          if (bypassRes.data?.success) {
            toast.success("Ödeme başarılı");
            const hasSession =
              isAuthenticated ||
              (typeof window !== "undefined" &&
                localStorage.getItem("tarodan_authed") === "1");
            if (isMembership) {
              router.push(membershipSuccessUrl);
            } else {
              router.push(
                `/payment/success?paymentId=${paymentId}${!hasSession ? "&guest=true" : ""}`,
              );
            }
            return;
          }
        } catch {
          /* bypass başarısız → normal kart formuna düş */
        }
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to fetch payment:", error);
      toast.error("Ödeme bilgisi yüklenemedi");
      router.push(
        isGuestCheckout
          ? "/"
          : isMembershipPayment
            ? "/profile/membership"
            : "/profile/orders",
      );
    } finally {
      setIsLoading(false);
    }
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
              router.push(isMembershipPayment ? "/profile/membership" : "/profile/orders")
            }
          >
            {isMembershipPayment ? "Üyelik Sayfasına Dön" : "Siparişlerime Dön"}
          </Button>
        </div>
      </div>
    );
  }

  // Tamamlanmış/başarısız ödemeyi yönlendir.
  if (payment.status === "completed") {
    if (isMembershipPayment) {
      const k = searchParams.get("kind");
      router.push(k ? `/membership/success?kind=${k}` : "/membership/success");
    } else {
      router.push(`/payment/success?paymentId=${paymentId}`);
    }
    return null;
  }
  if (payment.status === "failed") {
    router.push(`/payment/fail?paymentId=${paymentId}`);
    return null;
  }

  // Ödeme hedefi (Direct API kart formu için).
  const directTarget = {
    ...(payment.orderId ? { orderId: payment.orderId as string } : {}),
    ...(payment.checkoutGroupId ? { checkoutGroupId: payment.checkoutGroupId as string } : {}),
    ...(payment.tradeId ? { tradeId: payment.tradeId as string } : {}),
  };
  const hasTarget =
    !!directTarget.orderId || !!directTarget.checkoutGroupId || !!directTarget.tradeId;

  return (
    <div className="min-h-screen bg-surface py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-heading mb-2">Ödeme</h1>
          <p className="text-muted">PayTR ile güvenli ödeme</p>
        </div>

        {/* Payment Info Card */}
        <div className="bg-surface-elevated rounded-2xl shadow-sm ring-1 ring-border/60 overflow-hidden mb-6">
          <div className="flex items-center justify-between gap-4 p-6">
            <div>
              <p className="text-sm text-muted">Ödenecek tutar</p>
              <p className="mt-1 text-3xl sm:text-4xl font-bold text-heading tracking-tight tabular-nums">
                {payment.amount?.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-2xl font-semibold text-muted">TL</span>
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-warning-100 text-warning-800 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-warning-500 animate-pulse" />
              Ödeme bekleniyor
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted bg-success-50 border-t border-success-200/60 px-6 py-3">
            <ShieldCheckIcon className="w-5 h-5 text-success-500 shrink-0" />
            <span>256-bit SSL ile şifrelenmiş, PayTR güvenceli güvenli ödeme</span>
          </div>
        </div>

        {/* TEK ödeme yüzeyi: kart formu (misafir + üye) */}
        {hasTarget ? (
          <CardPaymentForm
            target={directTarget}
            amount={payment.amount}
            recurringEnabled={recurringEnabled}
            onSuccess={(pid) => {
              if (isMembershipPayment) {
                const k = searchParams.get("kind");
                router.push(k ? `/membership/success?kind=${k}` : "/membership/success");
              } else if (payment.tradeId) {
                router.push(`/profile/trades/${payment.tradeId}?paid=1`);
              } else {
                router.push(
                  `/payment/success?paymentId=${pid}${isGuestCheckout ? "&guest=true" : ""}`,
                );
              }
            }}
          />
        ) : (
          <div className="bg-surface-elevated rounded-xl shadow-sm p-8 text-center">
            <XCircleIcon className="w-16 h-16 text-danger-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ödeme Bilgisi Bulunamadı</h2>
            <p className="text-muted mb-6">
              Ödeme hedefi yüklenemedi. Lütfen tekrar deneyin.
            </p>
            <Button onClick={fetchPayment}>Tekrar Dene</Button>
          </div>
        )}

        {/* Vazgeç — ödemeden vazgeçince rezerve edilen stoğu anında serbest bırak */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="text-sm text-muted hover:text-danger-600 underline disabled:opacity-50"
          >
            {cancelling ? "Vazgeçiliyor…" : "Vazgeç ve geri dön"}
          </button>
        </div>

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
