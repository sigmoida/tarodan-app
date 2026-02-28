import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

interface SectionHeaderProps {
  title: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export default function SectionHeader({
  title,
  viewAllHref,
  viewAllLabel = 'Tümünü gör',
  icon,
  badge,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between gap-4 mb-4 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-1 h-6 bg-primary-500 flex-shrink-0" style={{borderRadius:'1px'}} />
        <h2 className="text-lg font-bold text-heading tracking-tight flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {badge}
      </div>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-orange-600 px-3 py-1.5 border border-gray-200 hover:border-orange-300 bg-white hover:bg-orange-50 transition-all duration-200 flex-shrink-0"
          style={{borderRadius:'4px'}}
        >
          {viewAllLabel}
          <ArrowRightIcon className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}
