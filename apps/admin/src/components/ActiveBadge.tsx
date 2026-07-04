import { Badge, Button } from '@tarodan/ui';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

/**
 * Aktif/Pasif rozeti — artık ortak `Badge` primitive'inin `active` moduna
 * delege eder. Kolonlarda doğrudan `<Badge active={...} />` kullanılır; bu
 * yardımcı yalnızca kolon-dışı (ör. BrandModelsPanel) kısa kullanım içindir.
 */
export function ActiveBadge({
  active,
  activeLabel = 'Aktif',
  passiveLabel = 'Pasif',
}: {
  active: boolean;
  activeLabel?: string;
  passiveLabel?: string;
}) {
  return <Badge active={active} activeLabel={activeLabel} passiveLabel={passiveLabel} />;
}

const activeCls = 'bg-success-100 text-success-700';
const passiveCls = 'bg-surface-alt text-muted';
const pill =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium';

/** Tıklanabilir Aktif/Pasif toggle — aynı görünüm, tek tıkla durum değiştirir. */
export function StatusToggle({
  active,
  onToggle,
  busy,
}: {
  active: boolean;
  onToggle: () => void;
  busy?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={onToggle}
      className={`${pill} ${active ? activeCls : passiveCls}`}
    >
      {active ? <CheckCircleIcon className="h-4 w-4" /> : <XCircleIcon className="h-4 w-4" />}
      {active ? 'Aktif' : 'Pasif'}
    </Button>
  );
}
