import { type ReactNode } from 'react';
import Link from 'next/link';
import { Button, cn, enumLabel, shipmentStatusConfig } from '@tarodan/ui';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { SectionCard } from '@/components/detail/SectionCard';
import type { TradeShipment } from '../types';
import { isShipmentDelivered } from '../_lib/trade';

export interface ShipmentLegCardProps {
  title: string;
  icon: ReactNode;
  shipments: TradeShipment[];
  actionLabel: string | null;
  onAction: ((shipmentId: string) => void) | null;
  /** Shipment id currently being processed by `onAction`. */
  processingShipmentId: string | null;
  infoMessage?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: (shipmentId: string) => void;
}

/** One shipment leg (to-warehouse / from-warehouse / return) with per-shipment actions. */
export function ShipmentLegCard({
  title,
  icon,
  shipments,
  actionLabel,
  onAction,
  processingShipmentId,
  infoMessage,
  secondaryActionLabel,
  onSecondaryAction,
}: ShipmentLegCardProps) {
  return (
    <SectionCard
      title={
        <>
          {icon}
          {title}
          <span className="text-sm font-normal text-muted">({shipments.length})</span>
        </>
      }
    >
      {infoMessage && (
        <p className="mb-4 rounded border border-info-200 bg-info-50 p-3 text-sm text-info-700">
          {infoMessage}
        </p>
      )}
      <div className="space-y-3">
        {shipments.map((s) => {
          const delivered = isShipmentDelivered(s);
          const isProcessing = processingShipmentId === s.id;
          return (
            <div
              key={s.id}
              className={cn(
                'rounded-lg border p-4',
                delivered ? 'border-success-200 bg-success-50' : 'border-border bg-surface',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1 text-sm">
                  {s.sender && (
                    <p>
                      <span className="font-medium text-body">Gönderen:</span>{' '}
                      <Link href={`/accounts/users/${s.sender.id}`} className="text-primary-600 hover:underline">
                        {s.sender.displayName}
                      </Link>
                    </p>
                  )}
                  {s.recipient && (
                    <p>
                      <span className="font-medium text-body">Alıcı:</span>{' '}
                      <Link href={`/accounts/users/${s.recipient.id}`} className="text-primary-600 hover:underline">
                        {s.recipient.displayName}
                      </Link>
                      {s.recipientType && (
                        <span className="ml-1 text-xs text-muted">({s.recipientType})</span>
                      )}
                    </p>
                  )}
                  {s.trackingNumber && (
                    <p>
                      <span className="font-medium text-body">Takip No:</span>{' '}
                      <span className="font-mono">{s.trackingNumber}</span>
                    </p>
                  )}
                  {s.carrier && (
                    <p>
                      <span className="font-medium text-body">Firma:</span> {s.carrier}
                    </p>
                  )}
                  {s.status && (
                    <p>
                      <span className="font-medium text-body">Durum:</span>{' '}
                      {enumLabel(shipmentStatusConfig, s.status)}
                    </p>
                  )}
                  {s.shippedAt && (
                    <p className="text-xs text-muted">
                      Gönderim: {new Date(s.shippedAt).toLocaleString('tr-TR')}
                    </p>
                  )}
                  {s.deliveredAt && (
                    <p className="text-xs text-success-700">
                      Teslim: {new Date(s.deliveredAt).toLocaleString('tr-TR')}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {s.lostAt ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-danger-700">
                      <XCircleIcon className="h-5 w-5" />
                      Kayıp
                    </span>
                  ) : delivered ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-success-700">
                      <CheckCircleIcon className="h-5 w-5" />
                      Teslim Edildi
                    </span>
                  ) : actionLabel && onAction ? (
                    <Button variant="primary" size="sm" onClick={() => onAction(s.id)} isLoading={isProcessing}>
                      {actionLabel}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">Beklemede</span>
                  )}
                  {!s.lostAt && !delivered && secondaryActionLabel && onSecondaryAction && (
                    <Button variant="outline" size="sm" onClick={() => onSecondaryAction(s.id)}>
                      {secondaryActionLabel}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
