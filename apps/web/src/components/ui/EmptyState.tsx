import { ShoppingBagIcon } from '@heroicons/react/24/outline';
import Button from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4">
        {icon || <ShoppingBagIcon className="w-8 h-8 text-subtle" />}
      </div>
      <p className="text-heading font-semibold text-lg mb-1">{title}</p>
      {description && (
        <p className="text-muted text-sm max-w-sm text-center">{description}</p>
      )}
      {actionLabel && actionHref && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" href={actionHref}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
