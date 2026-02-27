import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonBaseProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

type ButtonAsButton = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    href?: undefined;
  };

type ButtonAsLink = ButtonBaseProps & {
  href: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const sizeMap: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

const variantMap: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  outline:
    'inline-flex items-center justify-center gap-2 bg-transparent text-primary-500 border border-primary-500 rounded-md font-semibold transition-all duration-300 ease-premium hover:bg-primary-50 hover:shadow-soft',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const { variant = 'primary', size = 'md', children, icon, className = '', ...rest } = props;

  const classes = `${variantMap[variant]} ${sizeMap[size]} ${className}`.trim();

  if ('href' in rest && rest.href) {
    const { href, onClick, ...linkRest } = rest as ButtonAsLink;
    return (
      <Link href={href} className={classes} onClick={onClick} {...(linkRest as any)}>
        {icon}
        {children}
      </Link>
    );
  }

  const { ...btnRest } = rest as ButtonAsButton;
  return (
    <button ref={ref} className={classes} {...btnRest}>
      {icon}
      {children}
    </button>
  );
});

Button.displayName = 'Button';
export default Button;
