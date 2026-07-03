export interface CronDef {
  key: string;
  label: string;
  description: string;
}

export interface SearchItem {
  id: string;
  label: string;
  status?: string;
  dates: Record<string, string | null>;
}

export interface TestEnv {
  env: string;
  isProd: boolean;
}

export type AdjustAction = 'expire_now' | 'set_minutes' | 'backdate_days';

export const TYPES: { value: string; label: string; placeholder: string }[] = [
  { value: 'boost', label: 'Öne Çıkarma', placeholder: 'ürün başlığı veya slug' },
  { value: 'membership', label: 'Üyelik', placeholder: 'kullanıcı e-posta veya ad' },
  { value: 'refund', label: 'İade', placeholder: 'sipariş no veya iade id' },
  { value: 'order', label: 'Sipariş', placeholder: 'sipariş no' },
  { value: 'offer', label: 'Teklif', placeholder: 'teklif id veya ürün başlığı' },
  { value: 'trade', label: 'Takas', placeholder: 'takas id' },
  { value: 'hold', label: 'Escrow Hold', placeholder: 'sipariş no' },
  { value: 'email_verification', label: 'E-posta Doğrulama', placeholder: 'kullanıcı e-posta' },
  { value: 'password_reset', label: 'Şifre Sıfırlama', placeholder: 'kullanıcı e-posta' },
];

export const typeOptions = TYPES.map((t) => ({ value: t.value, label: t.label }));

/** Absolute + relative rendering of a stored timestamp. */
export function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  const rel = mins === 0 ? 'şimdi' : mins > 0 ? `~${mins} dk sonra` : `~${-mins} dk önce`;
  return `${d.toLocaleString('tr-TR')} (${rel})`;
}

/** Preview the new timestamp an adjust action would produce. */
export function previewAfter(action: AdjustAction, value: number): string {
  const now = Date.now();
  if (action === 'expire_now') return new Date(now).toISOString();
  if (action === 'set_minutes') return new Date(now + value * 60000).toISOString();
  return new Date(now - value * 86400000).toISOString();
}
