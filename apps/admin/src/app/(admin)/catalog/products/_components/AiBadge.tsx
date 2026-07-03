/** Ürünün AI görsel-denetim durumunu tek tip rozetle gösterir (liste + detay). */
export function AiBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const [cls, label] =
    status === 'flagged'
      ? ['bg-danger-500/20 text-danger-600', 'Uygunsuz']
      : status === 'review'
        ? ['bg-warning-500/20 text-warning-700', 'İnceleme']
        : ['bg-success-500/20 text-success-700', 'Temiz'];
  return (
    <span className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
