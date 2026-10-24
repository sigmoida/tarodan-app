/** @format */

import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

/** The outcome a payment result page shows. */
export type PaymentResultTone = "success" | "pending" | "failed" | "cancelled";

// Literal classes per tone (Tailwind only sees whole class names).
const TONES = {
  success: {
    Icon: CheckCircleIcon,
    circle: "bg-success-100",
    icon: "text-success-500",
  },
  pending: {
    Icon: ClockIcon,
    circle: "bg-warning-100",
    icon: "text-warning-600",
  },
  failed: {
    Icon: XCircleIcon,
    circle: "bg-danger-100",
    icon: "text-danger-500",
  },
  cancelled: {
    Icon: ExclamationTriangleIcon,
    circle: "bg-warning-100",
    icon: "text-warning-600",
  },
} as const;

/** The round outcome icon at the top of the payment result pages. */
export default function PaymentResultIcon({
  tone,
}: {
  tone: PaymentResultTone;
}) {
  const { Icon, circle, icon } = TONES[tone];
  return (
    <div
      className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${circle}`}
    >
      <Icon className={`h-12 w-12 ${icon}`} aria-hidden />
    </div>
  );
}
