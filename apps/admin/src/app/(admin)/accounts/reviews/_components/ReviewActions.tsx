import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';
import { ActionButtons, ActionIconButton } from '@/components/AdminList';
import { type ReviewStatus } from '../_lib/types';

/** Approve / reject / revert row actions shared by both review tabs. */
export function ReviewActions({
  status,
  onAct,
}: {
  status: ReviewStatus | undefined;
  onAct: (status: ReviewStatus) => void;
}) {
  const s = status ?? 'approved';
  return (
    <ActionButtons>
      {s !== 'approved' && (
        <ActionIconButton
          icon={CheckCircleIcon}
          onClick={() => onAct('approved')}
          title="Onayla"
          variant="success"
        />
      )}
      {s === 'rejected' ? (
        <ActionIconButton
          icon={ArrowUturnLeftIcon}
          onClick={() => onAct('pending')}
          title="Geri Al (Bekleyene çevir)"
        />
      ) : (
        <ActionIconButton
          icon={XCircleIcon}
          onClick={() => onAct('rejected')}
          title="Reddet"
          variant="danger"
        />
      )}
    </ActionButtons>
  );
}
