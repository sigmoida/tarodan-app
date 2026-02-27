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
    <div className={`flex items-center justify-between gap-4 mb-6 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-1 h-7 bg-primary-500 rounded-full flex-shrink-0" />
        <h2 className="text-xl font-extrabold text-heading tracking-tight flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {badge}
      </div>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-primary-500 px-1.5 py-0.5 rounded border border-gray-200 hover:border-primary-300 transition-all duration-200 flex-shrink-0"
        >
          {viewAllLabel}
          <ArrowRightIcon className="w-2.5 h-2.5" />
        </Link>
      )}
    </div>
  );
}
