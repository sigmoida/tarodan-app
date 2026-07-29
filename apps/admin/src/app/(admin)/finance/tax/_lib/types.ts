import {
  CalculatorIcon,
  ReceiptPercentIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface VatOverride {
  ruleId: string;
  categoryId: string;
  categoryName: string;
  rate: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface VatConfig {
  defaultRate: number;
  overrides: VatOverride[];
}

export interface WithholdingReport {
  period: string;
  summary: {
    totalWithholding: number;
    sellerCount: number;
    transferCount: number;
    pendingWithholding: number;
    pendingTransferCount: number;
  };
  rows: Array<{
    sellerId: string;
    sellerName: string;
    taxId: string | null;
    email: string | null;
    transferCount: number;
    grossAmount: number;
    withholdingTax: number;
  }>;
}

export interface TaxReport {
  summary: {
    fromDate: string;
    toDate: string;
    totalTaxCollected: number;
    totalRevenue: number;
    invoiceCount: number;
  };
  breakdown: Array<{
    period: string;
    taxCollected: number;
    revenue: number;
    count: number;
  }>;
}

export const taxTabs = (t: T) => [
  { key: "kdv", label: t("admin.finance.common.vat"), icon: CalculatorIcon },
  {
    key: "withholding",
    label: t("admin.finance.tax.withholding"),
    icon: ReceiptPercentIcon,
  },
  { key: "report", label: t("admin.finance.tax.report"), icon: ChartBarIcon },
];

export const months = (locale: string) =>
  Array.from({ length: 12 }, (_, index) =>
    new Date(2024, index, 1).toLocaleDateString(locale, { month: "long" }),
  );

export const groupByOptions = (t: T) => [
  { value: "day", label: t("admin.finance.tax.groupBy.day") },
  { value: "month", label: t("admin.finance.tax.groupBy.month") },
  { value: "year", label: t("admin.finance.tax.groupBy.year") },
];
