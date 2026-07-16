import type { StatusConfig } from '@tarodan/ui';
import { useTranslations } from 'next-intl';

type T = ReturnType<typeof useTranslations<never>>;

export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed';
export type ReportType = 'product' | 'user' | 'collection' | 'message';

export interface Report {
  id: string;
  type: ReportType;
  targetId: string;
  reason: string;
  description?: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt?: string;
  adminNote?: string;
  reporter?: { id: string; displayName: string; email: string };
}

export function reportStatusConfig(t: T): Record<string, StatusConfig> {
  return {
    pending: { label: t('admin.reports.status.pending'), variant: 'warning' },
    under_review: { label: t('admin.reports.status.underReview'), variant: 'info' },
    resolved: { label: t('admin.reports.status.resolved'), variant: 'success' },
    dismissed: { label: t('admin.reports.status.dismissed'), variant: 'default' },
  };
}

export function reportTypeLabels(t: T): Record<string, string> {
  return {
    product: t('admin.reports.type.product'),
    user: t('common.user'),
    collection: t('admin.reports.type.collection'),
    message: t('admin.reports.type.message'),
  };
}

export function reportReasonLabels(t: T): Record<string, string> {
  return {
    spam: t('admin.reports.reason.spam'),
    inappropriate_content: t('admin.reports.reason.inappropriateContent'),
    fake_product: t('admin.reports.reason.fakeProduct'),
    scam: t('admin.reports.reason.scam'),
    harassment: t('admin.reports.reason.harassment'),
    hate_speech: t('admin.reports.reason.hateSpeech'),
    counterfeit: t('admin.reports.reason.counterfeit'),
    wrong_category: t('admin.reports.reason.wrongCategory'),
    misleading_info: t('admin.reports.reason.misleadingInfo'),
    other: t('admin.reports.reason.other'),
  };
}

export function reportTypeOptions(t: T) {
  const labels = reportTypeLabels(t);
  return [
    { value: 'all', label: t('admin.reports.allTypes') },
    { value: 'product', label: labels.product },
    { value: 'user', label: labels.user },
    { value: 'collection', label: labels.collection },
    { value: 'message', label: labels.message },
  ];
}

export function reportStatusOptions(t: T) {
  const labels = reportStatusConfig(t);
  return [
    { value: 'all', label: t('admin.reports.allStatuses') },
    { value: 'pending', label: labels.pending!.label },
    { value: 'under_review', label: labels.under_review!.label },
    { value: 'resolved', label: labels.resolved!.label },
    { value: 'dismissed', label: labels.dismissed!.label },
  ];
}
