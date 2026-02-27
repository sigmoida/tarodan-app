import Link from 'next/link';
import Image from 'next/image';

interface BrandCardProps {
  name: string;
  href: string;
  logoUrl?: string;
}

export default function BrandCard({ name, href, logoUrl }: BrandCardProps) {
  return (
    <Link
      href={href}
      className="group flex-shrink-0 flex items-center justify-center w-[120px] h-[72px] p-2
                 transition-all duration-300 ease-premium"
      title={name}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={name}
          width={200}
          height={120}
          className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110"
          unoptimized
        />
      ) : (
        <span className="text-base font-bold text-subtle group-hover:text-primary-500 transition-colors duration-300">
          {name}
        </span>
      )}
    </Link>
  );
}
