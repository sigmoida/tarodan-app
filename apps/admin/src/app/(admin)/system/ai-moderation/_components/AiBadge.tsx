const CONFIG = {
  flagged: ['bg-danger-500/20 text-danger-600', 'Uygunsuz şüphesi'],
  review: ['bg-warning-500/20 text-warning-700', 'Düşük ilgililik'],
  passed: ['bg-success-500/20 text-success-700', 'Temiz · oto-onay'],
} as const;

/** AI moderation result pill — shared between the queue and the image tester. */
export function AiBadge({ state }: { state: keyof typeof CONFIG }) {
  const [cls, label] = CONFIG[state];
  return <span className={`rounded px-2 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}
