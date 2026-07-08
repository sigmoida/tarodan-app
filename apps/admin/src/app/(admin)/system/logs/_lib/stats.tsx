import {
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  ChartBarIcon,
  ShieldExclamationIcon,
  ArrowRightOnRectangleIcon,
  NoSymbolIcon,
  CheckCircleIcon,
  ArrowUturnLeftIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { type ComponentType } from 'react';
import { type MetricTone } from '@/components/MetricCard';
import { type LogTab } from './types';

export interface StatCardDef {
  icon: ComponentType<{ className?: string }>;
  tone: MetricTone;
  label: string;
  value: string | number;
}

/** Build the metric cards for a tab from its stats payload + total count. */
export function statCards(tab: LogTab, stats: any, total: number): StatCardDef[] {
  if (!stats) return [];
  if (tab === 'errors') {
    return [
      { icon: ExclamationTriangleIcon, tone: 'danger', label: 'Kritik', value: stats.critical ?? 0 },
      { icon: ExclamationCircleIcon, tone: 'warning', label: 'Hata', value: stats.error ?? 0 },
      { icon: InformationCircleIcon, tone: 'info', label: 'Uyarı', value: stats.warning ?? 0 },
      { icon: ChartBarIcon, tone: 'primary', label: 'Toplam', value: total },
    ];
  }
  if (tab === 'security') {
    return [
      { icon: ShieldExclamationIcon, tone: 'danger', label: 'Çözülmemiş Kritik', value: stats.unresolvedHighSeverity ?? 0 },
      { icon: ArrowRightOnRectangleIcon, tone: 'warning', label: 'Başarısız Giriş', value: stats.byEventType?.failed_login ?? 0 },
      { icon: NoSymbolIcon, tone: 'info', label: 'IP Engelleme', value: stats.byEventType?.ip_block ?? 0 },
      { icon: ChartBarIcon, tone: 'primary', label: 'Toplam', value: total },
    ];
  }
  if (tab === 'emails') {
    return [
      { icon: CheckCircleIcon, tone: 'success', label: 'Teslim Oranı', value: `${stats.deliveryRate ?? 0}%` },
      { icon: ArrowUturnLeftIcon, tone: 'danger', label: 'Bounce Oranı', value: `${stats.bounceRate ?? 0}%` },
      { icon: PaperAirplaneIcon, tone: 'info', label: 'Gönderilen', value: stats.byStatus?.sent ?? 0 },
      { icon: ChartBarIcon, tone: 'primary', label: 'Toplam', value: total },
    ];
  }
  return [];
}
