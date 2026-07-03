import { type ComponentType } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';
import { SectionCard } from './SectionCard';

export interface TimelineEntry {
  label: string;
  at?: string | null;
}

/**
 * A timestamped event list (created / updated / …). Entries with no `at` are
 * dropped, so callers can pass the full set and only the reached steps show.
 */
export function Timeline({
  items,
  title = 'Zaman Çizelgesi',
  icon = ClockIcon,
}: {
  items: TimelineEntry[];
  title?: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  const visible = items.filter((i) => i.at);
  if (visible.length === 0) return null;

  return (
    <SectionCard title={title} icon={icon}>
      <ol className="space-y-3">
        {visible.map((item, i) => (
          <li key={i}>
            <p className="text-sm font-medium text-heading">{item.label}</p>
            <p className="text-xs text-muted">
              {new Date(item.at as string).toLocaleString('tr-TR')}
            </p>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
