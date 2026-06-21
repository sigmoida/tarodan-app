"use client";

import { useState, useEffect, useRef } from "react";
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
import { Button } from "@tarodan/ui";

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
  // Geri dönüşte PayTR token'ları tek kullanımlıktır → bayat HTML boş iframe gösterir.
  // Süresi geçmiş / ürün tekrar satışta durumunu ayrı göster.
  const [isExpired, setIsExpired] = useState(false);
  // Mount başına tek initiate (taze token) — her render'da yeniden çağırma.
  const didInitiateRef = useRef(false);
  // fetchPayment mount başına TEK kez çalışmalı. StrictMode çift-effect'i ve
  // auth hidrasyonu (authLoading/isAuthenticated değişimi) effect'i birden çok
  // tetikler; her tetikte initiate çağırmak PayTR token'ını yeniden mint edip
  // (tek kullanımlık) önceki iframe'i geçersiz kılar → boş/açılmayan iframe.
  const startedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    const urlGuest =
      typeof window !== "undefined" &&
      window.location.search.includes("guest=true");
    const hasToken =
      typeof window !== "undefined" &&
      localStorage.getItem("tarodan_authed") === "1";
    // Oturum token'ı varken yalnızca isAuthenticated=false ise (ör. ağ hatası) girişe atma;
    // GET /payments/:id/status zaten isteğe bağlı JWT ile çalışır.
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
                localStorage.getItem("tarodan_authed") === "1");
            router.push(
              `/payment/success?paymentId=${paymentId}${!hasSession ? "&guest=true" : ""}`,
            );
            return;
          }
        } catch {
          // Not bypass mode or bypass failed — fall through to normal flow
        }
      }

      // Bekleyen PayTR ödemesinde geri dönüşte taze iFrame token al:
      // status endpoint'i bayat providerPaymentId ile iframe HTML üretir (tek kullanımlık
      // token → boş iframe). pending ise yeniden initiate edip taze token alırız.
      // Backend var olan Payment'ı yeniden kullanır + rezervasyonu CAS ile geri alır.
      if (
        paymentData.status === "pending" &&
        (paymentData.paymentHtml || paymentData.paymentUrl) &&
        !didInitiateRef.current
      ) {
        didInitiateRef.current = true;
        try {
          let initRes;
          if (paymentData.checkoutGroupId) {
            initRes = isGuest
              ? await paymentsApi.initiateGroupGuest(
                  paymentData.checkoutGroupId,
                  "paytr",
                )
              : await paymentsApi.initiateGroup(
                  paymentData.checkoutGroupId,
                  "paytr",
                );
          } else if (paymentData.tradeId) {
            initRes = await paymentsApi.initiateTradeCash(paymentData.tradeId);
          } else if (paymentData.orderId) {
            initRes = isGuest
              ? await paymentsApi.initiateGuest(paymentData.orderId, "paytr")
              : await paymentsApi.initiate(paymentData.orderId, "paytr");
          }
          if (initRes?.data) {
            const fresh = initRes.data as any;
            if (fresh.paymentHtml) {
              setPaymentHtml(fresh.paymentHtml);
              return;
            }
            if (fresh.paymentUrl) {
              const url = fresh.paymentUrl as string;
              if (!(url.includes("/payment/") && url.includes(paymentId))) {
                window.location.href = url;
                return;
              }
            }
          }
        } catch (initError: any) {
          // Rezervasyon geri alınamadı (ürün tekrar satışta) veya ödeme süresi doldu
          // → boş iframe yerine net "süre doldu" durumu göster.
          if (process.env.NODE_ENV === "development")
            console.error("Re-initiate failed:", initError);
          setIsExpired(true);
          return;
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

  const handlePaymentComplete = () => {
    setIsProcessing(true);
    // Poll for payment status
    const interval = setInterval(async () => {
      try {
        // Use guest endpoint if guest checkout
        const response = isGuestCheckout
          ? await paymentsApi.getStatusLightGuest(paymentId)
          : await paymentsApi.getStatusLight(paymentId);
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

  // Ödeme süresi doldu / taze token alınamadı (ürün tekrar satışa açıldı):
  // boş iframe yerine net bir mesaj göster.
  if (isExpired) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <XCircleIcon className="w-12 h-12 text-danger-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-heading mb-2">
            Ödeme süresi doldu
          </h2>
          <p className="text-muted mb-6">
            Bu ödemenin süresi doldu ve ürün tekrar satışa açıldı. Almak
            istiyorsanız ilanı yeniden ziyaret edip yeniden satın alabilirsiniz.
          </p>
          <Button
            onClick={() =>
              router.push(
                payment?.orders?.[0]?.productId
                  ? `/products/${payment.orders[0].productId}`
                  : payment?.order?.productId
                    ? `/products/${payment.order.productId}`
                    : "/products",
              )
            }
          >
            İlanlara Dön
          </Button>
        </div>
      </div>
    );
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

        {/* PayTR iframe / yönlendirme */}
        {paymentHtml ? (
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
