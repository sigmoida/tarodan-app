import Image from 'next/image';
import { Badge, Button } from '@tarodan/ui';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
} from '@heroicons/react/24/outline';
import { col, type RowActionItem } from '@/components/table';
import { type Ad, positionLabels, deviceLabels } from './types';

function DeviceIcon({ type }: { type: string }) {
  if (type === 'desktop') return <ComputerDesktopIcon className="h-4 w-4" />;
  if (type === 'mobile') return <DevicePhoneMobileIcon className="h-4 w-4" />;
  return <DeviceTabletIcon className="h-4 w-4" />;
}

export interface AdColumnProps {
  onToggle: (ad: Ad) => void;
  togglingId?: string;
  rowMenu: (ad: Ad) => RowActionItem[];
}

export function adColumns({ onToggle, togglingId, rowMenu }: AdColumnProps) {
  return [
    col.custom<Ad>(
      'Önizleme',
      (ad) =>
        ad.imageUrl ? (
          <div className="relative h-12 w-20 overflow-hidden rounded bg-surface-alt">
            <Image src={ad.imageUrl} alt={ad.title} fill className="object-contain" sizes="80px" />
          </div>
        ) : (
          <span className="text-sm text-muted">—</span>
        ),
      { grow: 1, minWidth: 96 },
    ),
    col.custom<Ad>(
      'Başlık',
      (ad) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-heading">{ad.title}</p>
          {ad.iabCompliant ? (
            <span className="flex items-center gap-1 text-xs text-success-700">
              <CheckCircleIcon className="h-3 w-3" /> IAB: {ad.iabSize}
            </span>
          ) : ad.width && ad.height ? (
            <span className="flex items-center gap-1 text-xs text-warning-700">
              <ExclamationTriangleIcon className="h-3 w-3" /> Non-IAB
            </span>
          ) : null}
        </div>
      ),
      { grow: 3, minWidth: 180 },
    ),
    col.muted<Ad>('Boyut', (ad) => (ad.width && ad.height ? `${ad.width}x${ad.height}` : null), {
      minWidth: 100,
    }),
    col.badge<Ad>('Pozisyon', (ad) => (
      <Badge variant="secondary" size="sm">
        {positionLabels[ad.position] || ad.position}
      </Badge>
    )),
    col.custom<Ad>('Cihaz', (ad) => (
      <span className="flex items-center gap-1 text-sm text-muted">
        <DeviceIcon type={ad.deviceType} />
        {deviceLabels[ad.deviceType] || ad.deviceType}
      </span>
    )),
    col.custom<Ad>('Durum', (ad) => (
      <Button
        variant={ad.isActive ? 'success' : 'secondary'}
        size="sm"
        onClick={() => onToggle(ad)}
        isLoading={togglingId === ad.id}
      >
        {ad.isActive ? 'Aktif' : 'Pasif'}
      </Button>
    )),
    col.custom<Ad>(
      'İstatistik',
      (ad) => (
        <div className="text-sm">
          <div className="text-muted">{ad.clickCount} tıklama</div>
          <div className="text-muted">{ad.impressionCount} görüntü</div>
          <div className="text-primary-600">{ad.ctr}% CTR</div>
        </div>
      ),
      { grow: 1, minWidth: 120 },
    ),
    col.rowMenu<Ad>(rowMenu),
  ];
}
