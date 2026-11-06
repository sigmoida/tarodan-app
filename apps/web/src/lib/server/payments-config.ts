import "server-only";

import { cache } from "react";
import type { PaymentsInstallmentsConfig } from "@tarodan/types";
import { getServerApiOrigin } from "@/lib/api/origin";
import { installmentsConfigOf } from "@/lib/installments";

/**
 * The installment switch for Server Components (content pages such as
 * `/payment-options`). Next caches the fetch for 5 minutes: after the admin
 * flips the switch the page follows within that time. An unreachable API
 * (build, outage) reads as off, the safe text (no installment promise).
 */
export const PAYMENTS_CONFIG_REVALIDATE_SECONDS = 300;

export const getInstallmentsConfig = cache(
  async (): Promise<PaymentsInstallmentsConfig> => {
    try {
      const response = await fetch(
        `${getServerApiOrigin()}/api/payments/config`,
        { next: { revalidate: PAYMENTS_CONFIG_REVALIDATE_SECONDS } },
      );
      if (!response.ok) return installmentsConfigOf(null);
      return installmentsConfigOf(await response.json());
    } catch {
      return installmentsConfigOf(null);
    }
  },
);
