type BadgeVariant = 'sale' | 'new' | 'rare' | 'preorder' | 'limited' | 'default';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  sale: 'badge-sale',
  new: 'badge-new',
  rare: 'badge-rare',
  preorder: 'bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-md',
  limited: 'bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-md',
  default: 'bg-gray-100 text-body text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200',
};

export default function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
