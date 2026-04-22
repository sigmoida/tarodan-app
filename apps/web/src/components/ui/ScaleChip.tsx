import Link from 'next/link';

interface ScaleChipProps {
  label: string;
  href: string;
  active?: boolean;
}

export default function ScaleChip({ label, href, active = false }: ScaleChipProps) {
  return (
    <Link
      href={href}
      className={`px-4 py-2.5 rounded-md text-sm font-medium border transition-all duration-300 ease-premium
        ${
          active
            ? 'border-primary-500 bg-primary-50 text-primary-600'
            : 'border-border bg-surface-elevated text-body hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 hover:shadow-soft'
        }`}
    >
      {label}
    </Link>
  );
}
