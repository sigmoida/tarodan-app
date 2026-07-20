import { Badge, Button } from '@tarodan/ui';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

/**
 * Active/Passive badge — now delegates to the `active` mode of the shared
 * `Badge` primitive. Columns use `<Badge active={...} />` directly; this
 * helper is only for brief non-column usage (e.g. BrandModelsPanel).
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

/** Clickable Active/Passive toggle — same look, flips state on one click. */
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
      isLoading={busy}
      onClick={onToggle}
      className={`${pill} ${active ? activeCls : passiveCls}`}
    >
      {active ? <CheckCircleIcon className="h-4 w-4" /> : <XCircleIcon className="h-4 w-4" />}
      {active ? 'Aktif' : 'Pasif'}
    </Button>
  );
}
