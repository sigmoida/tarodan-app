"use client";

import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/TextLink";
import { invoiceProcessHref } from "@/lib/invoice-process";
import {
  type Invoice,
  invoiceContextLabels,
  invoiceProcessLabel,
} from "../_lib/types";

/**
 * "Gerçekleşme Şekli" hücresi: rozetin altında belgenin dayandığı işlemin
 * numaraları, her biri kendi detayına bağlı. Koli ücret belgesi kolideki TÜM
 * siparişleri listeler — satır bu yüzden uzayabilir, numaralar alt alta durur
 * ve hiçbiri kırpılmaz.
 */
export function InvoiceProcessCell({ invoice }: { invoice: Invoice }) {
  const t = useTranslations();
  const { context, process } = invoice;
  return (
    <div className="flex flex-col items-start gap-1">
      {context ? (
        <Badge variant="outline">
          {invoiceContextLabels(t)[context] ?? context}
        </Badge>
      ) : (
        !process && <span className="text-muted">—</span>
      )}
      {process?.refs.map((ref) => (
        <TextLink
          key={`${ref.kind}:${ref.targetId}:${ref.label ?? ""}`}
          href={invoiceProcessHref(ref)}
          mono
          className="whitespace-nowrap text-xs"
        >
          {invoiceProcessLabel(t, ref)}
        </TextLink>
      ))}
    </div>
  );
}
