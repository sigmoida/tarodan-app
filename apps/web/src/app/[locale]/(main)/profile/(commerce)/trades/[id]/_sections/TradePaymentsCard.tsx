/** @format */

import { CheckCircleIcon, ClockIcon } from "@heroicons/react/24/outline";
import { Badge, Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { formatTL } from "@/lib/format";
import type { Trade, TradeQuote } from "../_lib/types";
import {
  buildTradePaymentPanels,
  tradePaymentProgress,
  viewerCanPay,
  type TradePaymentPanel,
} from "../_lib/tradePayments";

interface TradePaymentsCardProps {
  trade: Trade;
  quote: TradeQuote | null;
  userId?: string;
  onPay: () => void;
  cashPaymentLoading: boolean;
  /** Ödeme aşamasında iptal — düğme bu kartta, ödeme düğmesinin yanında durur. */
  canCancel?: boolean;
  onCancel?: () => void;
  isActionLoading?: boolean;
}

/** Panellerde hangi KOŞULLU kalemlerin yer tutacağı. */
interface OptionalLines {
  cashDifference: boolean;
  commission: boolean;
}

/**
 * Bir kalem satırı.
 *
 * `always` verilen kalemler (hizmet bedeli, kargo) YAPISALDIR: 0 olsalar da
 * gösterilirler — aksi halde "bu takasta ücret alınmıyor" ile "ücret
 * hesaplanamadı" ayırt edilemiyordu.
 *
 * `reserve`, kalemin KARŞI panelde bulunup bu panelde bulunmadığı durumdur:
 * satır görünmez ama yerini korur. Yoksa nakit farkı yalnız bir taraf ödediğinde
 * o panel bir satır uzuyor ve iki kartın "Toplam" satırları kayıyordu.
 */
function AmountLine({
  label,
  amount,
  always = false,
  reserve = false,
}: {
  label: string;
  amount: number;
  always?: boolean;
  reserve?: boolean;
}) {
  const visible = always || amount > 0;
  if (!visible && !reserve) return null;
  return (
    <div
      className={`flex items-center justify-between text-sm${visible ? "" : " invisible"}`}
      aria-hidden={visible ? undefined : true}
    >
      <span className="text-muted">{label}</span>
      <span className="text-body font-medium">{formatTL(amount)}</span>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string | null }) {
  const t = useTranslations();
  if (status === "completed") {
    return (
      <Badge
        variant="success"
        size="sm"
        className="rounded-full"
        icon={<CheckCircleIcon className="w-3.5 h-3.5" />}
      >
        {t("trade.paymentPaid")}
      </Badge>
    );
  }
  if (status === "refunded") {
    return (
      <Badge variant="secondary" size="sm" className="rounded-full">
        {t("trade.paymentRefunded")}
      </Badge>
    );
  }
  if (!status) return null;
  return (
    <Badge
      variant="warning"
      size="sm"
      className="rounded-full"
      icon={<ClockIcon className="w-3.5 h-3.5" />}
    >
      {t("trade.paymentPending")}
    </Badge>
  );
}

function PaymentPanel({
  panel,
  optional,
}: {
  panel: TradePaymentPanel;
  optional: OptionalLines;
}) {
  const t = useTranslations();
  return (
    <div
      className={`flex flex-col rounded-lg border p-4 ${
        panel.isViewer
          ? "border-primary-200 bg-surface"
          : "border-border bg-surface-alt/50"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-heading">
          {panel.isViewer
            ? t("trade.yourPayment")
            : t("trade.theirPayment", { name: panel.name })}
        </p>
        <PaymentStatusBadge status={panel.status} />
      </div>

      <div className="space-y-1.5">
        <AmountLine
          label={t("trade.serviceFee")}
          amount={panel.serviceFee}
          always
        />
        <AmountLine
          label={t("trade.shippingFee")}
          amount={panel.shipping}
          always
        />
        <AmountLine
          label={t("trade.cashDifferenceLine")}
          amount={panel.cashDifference}
          reserve={optional.cashDifference}
        />
        {/* v1 takaslar komisyonla biter; kalem yalnız onlarda görünür. */}
        <AmountLine
          label={t("trade.commissionLine")}
          amount={panel.commission}
          reserve={optional.commission}
        />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold text-heading">
          {t("trade.paymentTotal")}
        </span>
        <span className="text-lg font-bold text-primary-600">
          {formatTL(panel.total)}
        </span>
      </div>
    </div>
  );
}

/**
 * Takasın ödeme kalemleri — İKİ taraf için de.
 *
 * Eski kart yalnız nakit farkını ve onu ödeyen tarafı gösteriyordu. Artık her
 * iki taraf hizmet bedeli + 2 bacaklık kargo (+ varsa fark) ödüyor ve süreç iki
 * ödeme tamamlanmadan başlamıyor; ekranın da bunu göstermesi gerekiyor.
 *
 * Ödeme aşamasının TÜM eylemleri bu kartta toplanır (öde + iptal, yan yana):
 * iptal ayrı bir kartta dururken kullanıcı aynı kararın iki parçasını iki farklı
 * yüzeyde görüyordu.
 */
export default function TradePaymentsCard({
  trade,
  quote,
  userId,
  onPay,
  cashPaymentLoading,
  canCancel = false,
  onCancel,
  isActionLoading = false,
}: TradePaymentsCardProps) {
  const t = useTranslations();
  const panels = buildTradePaymentPanels(trade, quote, userId);
  if (panels.length === 0) return null;

  const progress = tradePaymentProgress(trade);
  const viewerPanel = panels.find((panel) => panel.isViewer) ?? null;
  const canPay = viewerCanPay(trade, quote, userId);
  const waitingForCounterparty =
    !!viewerPanel &&
    viewerPanel.status === "completed" &&
    !progress.allPaid &&
    trade.status === "awaiting_payment";

  // Koşullu kalemler: bir tarafta varsa İKİ panelde de yer tutulur.
  const optional: OptionalLines = {
    cashDifference: panels.some((panel) => panel.cashDifference > 0),
    commission: panels.some((panel) => panel.commission > 0),
  };

  const showCancel = canPay && canCancel && !!onCancel;

  return (
    <div className="card mb-6 p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-heading">
            {t("trade.paymentsTitle")}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{t("trade.paymentsDesc")}</p>
        </div>
        {progress.total > 0 && (
          <Badge
            variant={progress.allPaid ? "success" : "warning"}
            size="sm"
            className="rounded-full"
          >
            {t("trade.paymentsProgress", {
              paid: progress.paid,
              total: progress.total,
            })}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
        {panels.map((panel) => (
          <PaymentPanel key={panel.userId} panel={panel} optional={optional} />
        ))}
      </div>

      {waitingForCounterparty && (
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-surface-alt px-4 py-3">
          <p className="text-sm text-body">
            {t("trade.waitingCounterpartyPayment")}
          </p>
        </div>
      )}

      {canPay && (
        <div className="mt-5 border-t border-border pt-5">
          <h3 className="text-base font-semibold text-heading">
            {t("payment.completeYourPayment")}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{t("trade.bothMustPay")}</p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={onPay}
              disabled={cashPaymentLoading}
            >
              {cashPaymentLoading ? t("checkout.processing") : t("payment.pay")}
            </Button>
            {showCancel && (
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={onCancel}
                disabled={isActionLoading || cashPaymentLoading}
              >
                {t("trade.cancelTradeAction")}
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-subtle">
        {t("trade.shippingNotRefundable")}
      </p>
    </div>
  );
}
