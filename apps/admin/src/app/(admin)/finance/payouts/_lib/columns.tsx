import { col } from '@/components/table';
import { HoldReasonBadge, holdReasonForRow } from './holds';
import { type ScheduleItem } from './types';

export const scheduleColumns = [
  col.text<ScheduleItem>('Sipariş', (s) => s.orderNumber),
  col.text<ScheduleItem>('Satıcı', (s) => s.sellerName),
  col.money<ScheduleItem>('Tutar', (s) => s.amount),
  col.date<ScheduleItem>('Serbest Bırakma Tarihi', (s) => s.releaseAt),
  col.badge<ScheduleItem>('Bekleme Nedeni', (s) => (
    <HoldReasonBadge reason={holdReasonForRow({ status: 'held', releaseAt: s.releaseAt })} />
  )),
];
