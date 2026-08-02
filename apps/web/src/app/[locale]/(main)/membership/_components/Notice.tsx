/** @format */

"use client";

import type { ReactNode } from "react";

/**
 * Üyelik ekranındaki tüm bilgilendirme kutularının TEK gövdesi.
 *
 * Eskiden her uyarı kendi rengini ve kenarlığını taşıyordu (mavi `info`, dolgulu
 * `warning`, çift kalınlıkta çerçeve) — aynı öneme sahip üç kutu üç farklı ağırlıkta
 * görünüyordu. Artık hepsi aynı nötr kutu; ayrım metinde, renkte değil.
 */
export default function Notice({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-4">
      {title && (
        <p className="mb-1 text-sm font-semibold text-heading">{title}</p>
      )}
      <div className="text-sm text-body">{children}</div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
